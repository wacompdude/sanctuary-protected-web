import { getMobileAuthContext } from "@/lib/mfa/mobile-api";
import { normalizeExpoPushToken } from "@/lib/notifications/endpoints/normalize";
import { isUsableOrganizationStatus } from "@/lib/organization/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { mobileNotificationCorsHeaders } from "@/lib/notifications/mobile-api";

export { mobileNotificationCorsHeaders };

export type MobilePushRegisterInput = {
  organizationId?: string | null;
  expoPushToken?: string | null;
  platform?: string | null;
};

export type MobilePushRegisterResponse =
  | { status: "unauthenticated"; error: string }
  | { status: "forbidden"; error: string }
  | { status: "error"; error: string }
  | { status: "ok"; registeredOrganizationIds: string[] };

function platformLabel(platform: string | null): string {
  if (platform === "ios") return "iOS device";
  if (platform === "android") return "Android device";
  return "Mobile device";
}

export async function registerMobilePushToken(
  request: Request,
  input: MobilePushRegisterInput,
): Promise<{ body: MobilePushRegisterResponse; status: number }> {
  const ctx = await getMobileAuthContext(request);
  if (!ctx) {
    return {
      status: 401,
      body: {
        status: "unauthenticated",
        error: "Sign in with your email and password first.",
      },
    };
  }

  const token = normalizeExpoPushToken(String(input.expoPushToken ?? ""));
  if (!token) {
    return {
      status: 400,
      body: { status: "error", error: "A valid Expo push token is required." },
    };
  }

  const requestedOrganizationId = input.organizationId?.trim() || null;
  const platform = String(input.platform ?? "").trim().toLowerCase() || null;
  const admin = createAdminClient();

  const { data: memberships, error: membershipError } = await admin
    .from("organization_memberships")
    .select("id, organization_id, status")
    .eq("user_id", ctx.userId)
    .eq("status", "active");

  if (membershipError) {
    return {
      status: 500,
      body: { status: "error", error: membershipError.message },
    };
  }

  const active = (memberships ?? []) as Array<{
    id: string;
    organization_id: string;
    status: string;
  }>;
  if (active.length === 0) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have access to an active organization.",
      },
    };
  }

  if (
    requestedOrganizationId &&
    !active.some((row) => row.organization_id === requestedOrganizationId)
  ) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "You do not have access to this organization.",
      },
    };
  }

  const organizationIds = [
    ...new Set(active.map((row) => row.organization_id)),
  ];
  const { data: organizations } = await admin
    .from("organizations")
    .select("id, status")
    .in("id", organizationIds);

  const usableIds = new Set(
    ((organizations ?? []) as Array<{ id: string; status: string }>)
      .filter((row) => isUsableOrganizationStatus(row.status))
      .map((row) => row.id),
  );

  const targets = active.filter((row) => usableIds.has(row.organization_id));
  if (targets.length === 0) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "This organization is not active.",
      },
    };
  }

  const now = new Date().toISOString();
  const label = platformLabel(platform);
  const registeredOrganizationIds: string[] = [];

  for (const membership of targets) {
    const organizationId = membership.organization_id;

    await admin
      .from("notification_endpoints")
      .update({
        status: "invalid",
        is_primary: false,
        revoked_at: now,
        updated_at: now,
      })
      .eq("organization_id", organizationId)
      .eq("user_id", ctx.userId)
      .eq("channel", "push")
      .eq("status", "active")
      .neq("normalized_destination", token);

    const { data: existing, error: lookupError } = await admin
      .from("notification_endpoints")
      .select("id, status")
      .eq("organization_id", organizationId)
      .eq("user_id", ctx.userId)
      .eq("channel", "push")
      .eq("normalized_destination", token)
      .maybeSingle();

    if (lookupError) {
      return {
        status: 500,
        body: { status: "error", error: lookupError.message },
      };
    }

    let created = !existing || existing.status !== "active";

    if (existing) {
      await admin
        .from("notification_endpoints")
        .update({ is_primary: false })
        .eq("organization_id", organizationId)
        .eq("user_id", ctx.userId)
        .eq("channel", "push")
        .eq("is_primary", true)
        .neq("id", existing.id);

      const { error: updateError } = await admin
        .from("notification_endpoints")
        .update({
          membership_id: membership.id,
          destination: token,
          label,
          is_primary: true,
          is_verified: true,
          verified_at: now,
          status: "active",
          consent_status: "granted",
          consent_recorded_at: now,
          consent_source: "mobile_app",
          revoked_at: null,
          suppressed_at: null,
          updated_at: now,
        })
        .eq("id", existing.id);
      if (updateError) {
        return {
          status: 500,
          body: { status: "error", error: updateError.message },
        };
      }
    } else {
      await admin
        .from("notification_endpoints")
        .update({ is_primary: false })
        .eq("organization_id", organizationId)
        .eq("user_id", ctx.userId)
        .eq("channel", "push")
        .eq("is_primary", true);

      const { error: insertError } = await admin
        .from("notification_endpoints")
        .insert({
          organization_id: organizationId,
          user_id: ctx.userId,
          membership_id: membership.id,
          channel: "push",
          destination: token,
          normalized_destination: token,
          label,
          is_primary: true,
          is_verified: true,
          verified_at: now,
          status: "active",
          consent_status: "granted",
          consent_recorded_at: now,
          consent_source: "mobile_app",
        });
      if (insertError) {
        return {
          status: 500,
          body: { status: "error", error: insertError.message },
        };
      }
      created = true;
    }

    if (created) {
      await enableChurchPushIfFirstDevice(admin, organizationId);
    }
    registeredOrganizationIds.push(organizationId);
  }

  return {
    status: 200,
    body: { status: "ok", registeredOrganizationIds },
  };
}

async function enableChurchPushIfFirstDevice(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { count } = await admin
    .from("notification_endpoints")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("channel", "push")
    .eq("status", "active");

  if ((count ?? 0) !== 1) return;

  const { data: settings } = await admin
    .from("organization_notification_settings")
    .select("id, push_notifications_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!settings) {
    await admin.from("organization_notification_settings").insert({
      organization_id: organizationId,
      push_notifications_enabled: true,
    });
    return;
  }

  if (settings.push_notifications_enabled) return;

  await admin
    .from("organization_notification_settings")
    .update({
      push_notifications_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settings.id);
}

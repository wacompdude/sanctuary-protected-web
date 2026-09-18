import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getMobileAuthContext } from "@/lib/mfa/mobile-api";
import { createNotification } from "@/lib/notifications/create-notification";
import { retryFailedDelivery } from "@/lib/notifications/dispatch-notification";
import {
  canCreateOperationalNotifications,
  canManageChurchNotificationSettings,
  canRetryNotificationDelivery,
  canViewNotificationHistory,
} from "@/lib/notifications/permissions";
import {
  isNotificationChannel,
  isNotificationSeverity,
  OPERATIONAL_ALERT_CHANNELS,
} from "@/lib/notifications/constants";
import type { NotificationChannel } from "@/lib/notifications/types";
import { isValidIanaTimeZone } from "@/lib/datetime/timezones";
import { labelForMembershipRole } from "@/lib/organization/invitations";
import { displayMemberName } from "@/lib/organization/team";
import {
  isUsableOrganizationStatus,
  normalizeMembershipRole,
  type MembershipRole,
} from "@/lib/organization/types";
import { loadHiddenPlatformOperatorUserIds } from "@/lib/platform/hidden-from-church";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { getChurchSubscription } from "@/lib/subscriptions/queries";
import { createAdminClient } from "@/lib/supabase/admin";

export type MobileComposeGroup = {
  id: string;
  name: string;
  isSystemGroup: boolean;
  subtitle: string;
};

export type MobileComposeMember = {
  membershipId: string;
  name: string;
  role: string;
};

type MobileAuthFailure =
  | { status: "unauthenticated"; error: string }
  | { status: "forbidden"; error: string };

export type MobileComposeResponse =
  | MobileAuthFailure
  | { status: "error"; error: string }
  | {
      status: "ok";
      organizationId: string;
      organizationName: string;
      canEmergencyOverride: boolean;
      defaultGroupIds: string[];
      groups: MobileComposeGroup[];
      members: MobileComposeMember[];
    };

export type MobileSendNotificationInput = {
  organizationId?: string | null;
  notificationType?: string | null;
  severity?: string | null;
  title?: string | null;
  body?: string | null;
  actionUrl?: string | null;
  groupIds?: string[] | null;
  membershipIds?: string[] | null;
  channels?: string[] | null;
  requiresAcknowledgment?: boolean | null;
  emergencyOverride?: boolean | null;
};

export type MobileSendNotificationResponse =
  | MobileAuthFailure
  | { status: "error"; error: string }
  | {
      status: "ok";
      notificationId: string;
      recipientCount: number;
    };

type MembershipContext = {
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function mobileNotificationCorsHeaders() {
  return CORS_HEADERS;
}

export { getMobileAuthContext };

function parseDeliverableChannels(
  requested: string[] | null | undefined,
): NotificationChannel[] {
  const selected = (requested ?? [])
    .map((value) => String(value).trim())
    .filter((value): value is NotificationChannel =>
      isNotificationChannel(value),
    );
  const channels = (
    selected.length > 0 ? selected : [...OPERATIONAL_ALERT_CHANNELS]
  ).filter(
    (channel) =>
      channel === "in_app" || channel === "email" || channel === "push",
  );
  if (!channels.includes("push")) {
    channels.push("push");
  }
  return channels.length > 0 ? channels : [...OPERATIONAL_ALERT_CHANNELS];
}

function isDefaultSecurityGroup(group: {
  name: string;
  dynamic_rule_type: string | null;
  dynamic_rule_value: string | null;
}): boolean {
  const name = group.name.trim().toLowerCase();
  if (
    name === "all security team members" ||
    name === "all security leaders"
  ) {
    return true;
  }
  return (
    group.dynamic_rule_type === "role" &&
    (group.dynamic_rule_value === "security_member" ||
      group.dynamic_rule_value === "security_leader")
  );
}

async function organizationAllowsFeature(
  organizationId: string,
  featureKey: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const subscription = await getChurchSubscription(organizationId, admin);
  let planId = subscription?.plan_id ?? null;

  if (!planId) {
    const { data: defaultPlan } = await admin
      .from("subscription_plans")
      .select("id")
      .eq("is_default", true)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    planId = defaultPlan?.id ?? null;
  }

  if (!planId) return false;

  const { data } = await admin
    .from("plan_features")
    .select("boolean_value, features!inner(feature_key)")
    .eq("plan_id", planId);

  const match = (data ?? []).find((row) => {
    const feature = Array.isArray(row.features) ? row.features[0] : row.features;
    return (feature as { feature_key?: string } | null)?.feature_key === featureKey;
  });

  return Boolean((match as { boolean_value?: boolean | null } | undefined)?.boolean_value);
}

async function loadMembershipContext(
  userId: string,
  organizationId: string,
): Promise<MembershipContext | { error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_memberships")
    .select("role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return { error: "You do not have access to this organization." };
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("name, display_name, status")
    .eq("id", organizationId)
    .maybeSingle();

  if (!isUsableOrganizationStatus(organization?.status)) {
    return { error: "This organization is not active." };
  }

  return {
    organizationId,
    organizationName:
      organization?.display_name || organization?.name || "Organization",
    role: normalizeMembershipRole(String(data.role)),
  };
}

async function requireComposerMembership(
  request: Request,
  organizationId: string | null,
): Promise<
  | { error: MobileAuthFailure; status: number }
  | { userId: string; membership: MembershipContext }
> {
  const ctx = await getMobileAuthContext(request);
  if (!ctx) {
    return {
      status: 401,
      error: {
        status: "unauthenticated",
        error: "Sign in with your email and password first.",
      },
    };
  }

  const requested = organizationId?.trim() || null;
  if (!requested) {
    return {
      status: 400,
      error: {
        status: "forbidden",
        error: "Select an organization first.",
      },
    };
  }

  const membership = await loadMembershipContext(ctx.userId, requested);
  if ("error" in membership) {
    return {
      status: 403,
      error: { status: "forbidden", error: membership.error },
    };
  }

  if (!canCreateOperationalNotifications(membership.role)) {
    return {
      status: 403,
      error: {
        status: "forbidden",
        error: "Security leaders and administrators can send group notifications.",
      },
    };
  }

  return { userId: ctx.userId, membership };
}

export async function loadMobileNotificationComposer(
  request: Request,
  organizationId: string | null,
): Promise<{ body: MobileComposeResponse; status: number }> {
  const auth = await requireComposerMembership(request, organizationId);
  if ("error" in auth) {
    return { body: auth.error, status: auth.status };
  }

  const admin = createAdminClient();
  const [{ data: groupRows, error: groupError }, { data: memberRows, error: memberError }, hiddenUserIds] =
    await Promise.all([
      admin
        .from("notification_groups")
        .select(
          "id, name, group_type, is_system_group, dynamic_rule_type, dynamic_rule_value, status",
        )
        .eq("organization_id", auth.membership.organizationId)
        .eq("status", "active")
        .order("name", { ascending: true }),
      admin.rpc("list_organization_team_memberships", {
        p_organization_id: auth.membership.organizationId,
      }),
      loadHiddenPlatformOperatorUserIds(),
    ]);

  if (groupError) {
    return {
      status: 500,
      body: {
        status: "error",
        error: groupError.message,
      },
    };
  }

  if (memberError) {
    console.error("mobile compose members failed:", memberError.message);
  }

  const groups: MobileComposeGroup[] = ((groupRows ?? []) as Array<{
    id: string;
    name: string;
    group_type: string | null;
    is_system_group: boolean | null;
    dynamic_rule_type: string | null;
    dynamic_rule_value: string | null;
  }>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    isSystemGroup: Boolean(row.is_system_group),
    subtitle: row.is_system_group
      ? "System · dynamic membership"
      : row.group_type
        ? String(row.group_type).replaceAll("_", " ")
        : "Group",
  }));

  const defaultGroupIds = ((groupRows ?? []) as Array<{
    id: string;
    name: string;
    dynamic_rule_type: string | null;
    dynamic_rule_value: string | null;
  }>)
    .filter((row) => isDefaultSecurityGroup(row))
    .map((row) => String(row.id));

  const members: MobileComposeMember[] = (
    (memberRows ?? []) as Array<{
      membership_id: string;
      user_id: string;
      email: string | null;
      role: string;
      status: string;
      first_name: string | null;
      last_name: string | null;
      full_name: string | null;
    }>
  )
    .filter((row) => row.status === "active" && !hiddenUserIds.has(row.user_id))
    .map((row) => ({
      membershipId: String(row.membership_id),
      name: displayMemberName({
        full_name: row.full_name,
        first_name: row.first_name,
        last_name: row.last_name,
      }),
      role: labelForMembershipRole(row.role),
    }));

  return {
    status: 200,
    body: {
      status: "ok",
      organizationId: auth.membership.organizationId,
      organizationName: auth.membership.organizationName,
      canEmergencyOverride: canManageChurchNotificationSettings(
        auth.membership.role,
      ),
      defaultGroupIds,
      groups,
      members,
    },
  };
}

export async function sendMobileNotification(
  request: Request,
  input: MobileSendNotificationInput,
): Promise<{ body: MobileSendNotificationResponse; status: number }> {
  const auth = await requireComposerMembership(
    request,
    input.organizationId ?? null,
  );
  if ("error" in auth) {
    return { body: auth.error, status: auth.status };
  }

  const title = String(input.title ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!title || !body) {
    return {
      status: 400,
      body: { status: "error", error: "Title and message are required." },
    };
  }
  if (title.length > 500) {
    return {
      status: 400,
      body: { status: "error", error: "Title must be 500 characters or fewer." },
    };
  }
  if (body.length > 20000) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "Message must be 20,000 characters or fewer.",
      },
    };
  }

  const groupIds = [...new Set((input.groupIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
  const membershipIds = [
    ...new Set(
      (input.membershipIds ?? []).map((id) => String(id).trim()).filter(Boolean),
    ),
  ];
  if (groupIds.length === 0 && membershipIds.length === 0) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "Select at least one notification group or member.",
      },
    };
  }

  const emergency =
    Boolean(input.emergencyOverride) &&
    canManageChurchNotificationSettings(auth.membership.role);
  let severityRaw = String(input.severity ?? "high").trim();
  if (emergency) {
    severityRaw = "critical";
  }
  if (!isNotificationSeverity(severityRaw)) {
    return {
      status: 400,
      body: { status: "error", error: "Select a valid severity." },
    };
  }

  const notificationType =
    String(input.notificationType ?? "emergency.alert").trim() ||
    "emergency.alert";
  const actionUrl = String(input.actionUrl ?? "").trim() || null;
  const channels = parseDeliverableChannels(input.channels);

  try {
    if (channels.includes("email")) {
      const allowed = await organizationAllowsFeature(
        auth.membership.organizationId,
        FEATURE_KEYS.EMAIL,
      );
      if (!allowed) {
        return {
          status: 403,
          body: {
            status: "error",
            error: "Email messaging is not included in this plan.",
          },
        };
      }
    }

    if (groupIds.length > 0) {
      const allowed = await organizationAllowsFeature(
        auth.membership.organizationId,
        FEATURE_KEYS.GROUP_EMAIL,
      );
      if (!allowed) {
        return {
          status: 403,
          body: {
            status: "error",
            error: "Group notifications are not included in this plan.",
          },
        };
      }
    }

    const result = await createNotification(
      {
        organizationId: auth.membership.organizationId,
        createdBy: auth.userId,
        notificationType,
        severity: severityRaw,
        title,
        body,
        summary: body.slice(0, 280),
        actionUrl,
        channels,
        targetGroupIds: groupIds,
        targetMembershipIds: membershipIds,
        requiresAcknowledgment: Boolean(input.requiresAcknowledgment),
        deduplicationKey: `composer:${auth.membership.organizationId}:${notificationType}:${Date.now()}`,
        metadata: {
          composer: true,
          via: "mobile",
          emergency_override_requested: emergency,
        },
      },
      { dispatchNow: true },
    );

    if (!result.notificationId) {
      return {
        status: 400,
        body: {
          status: "error",
          error:
            result.error ??
            (result.status === "duplicate"
              ? "A duplicate notification was skipped."
              : "Unable to send notification."),
        },
      };
    }

    const admin = createAdminClient();
    await writeAuditLog(admin, {
      organizationId: auth.membership.organizationId,
      userId: auth.userId,
      action: AuditAction.NOTIFICATION_CREATED,
      entityType: AuditEntityType.NOTIFICATION,
      entityId: result.notificationId,
      metadata: {
        via: "mobile_composer",
        recipient_count: result.recipientCount,
        delivery_count: result.deliveryCount,
        group_count: groupIds.length,
        emergency,
      },
    });

    return {
      status: 200,
      body: {
        status: "ok",
        notificationId: result.notificationId,
        recipientCount: result.recipientCount,
      },
    };
  } catch (error) {
    console.error("mobile send notification failed:", error);
    return {
      status: 500,
      body: {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to send notification.",
      },
    };
  }
}

export type MobileNotificationSettingsInput = {
  organizationId?: string | null;
  emailNotificationsEnabled?: boolean | null;
  smsNotificationsEnabled?: boolean | null;
  pushNotificationsEnabled?: boolean | null;
  criticalAlertOverrideEnabled?: boolean | null;
  dailyDigestEnabled?: boolean | null;
  dailyDigestTime?: string | null;
  weeklyDigestEnabled?: boolean | null;
  weeklyDigestDay?: number | null;
  weeklyDigestTime?: string | null;
  timezone?: string | null;
  certificationWarningDays?: number | null;
  maintenanceWarningDays?: number | null;
  maxEmailAttempts?: number | null;
};

export async function updateMobileNotificationSettings(
  request: Request,
  input: MobileNotificationSettingsInput,
): Promise<{ status: number; body: MobileAuthFailure | { status: "ok" } | { status: "error"; error: string } }> {
  const auth = await requireComposerMembership(
    request,
    input.organizationId ?? null,
  );
  if ("error" in auth) {
    return { status: auth.status, body: auth.error };
  }

  if (!canManageChurchNotificationSettings(auth.membership.role)) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "Administrators can update organization notification settings.",
      },
    };
  }

  const emailEnabled = Boolean(input.emailNotificationsEnabled);
  const smsEnabled = Boolean(input.smsNotificationsEnabled);
  if (emailEnabled) {
    const allowed = await organizationAllowsFeature(
      auth.membership.organizationId,
      FEATURE_KEYS.EMAIL,
    );
    if (!allowed) {
      return {
        status: 403,
        body: {
          status: "error",
          error: "Email messaging is not included in this plan.",
        },
      };
    }
  }
  if (smsEnabled) {
    const allowed = await organizationAllowsFeature(
      auth.membership.organizationId,
      FEATURE_KEYS.SMS,
    );
    if (!allowed) {
      return {
        status: 403,
        body: {
          status: "error",
          error: "SMS messaging is not included in this plan.",
        },
      };
    }
  }

  const timezone = String(input.timezone ?? "UTC").trim() || "UTC";
  if (!isValidIanaTimeZone(timezone)) {
    return {
      status: 400,
      body: { status: "error", error: "Select a valid time zone." },
    };
  }

  const weeklyDigestDay = Number(input.weeklyDigestDay ?? 1);
  const certificationWarningDays = Number(
    input.certificationWarningDays ?? 60,
  );
  const maintenanceWarningDays = Number(input.maintenanceWarningDays ?? 30);
  const maxEmailAttempts = Number(input.maxEmailAttempts ?? 3);

  if (
    !Number.isInteger(weeklyDigestDay) ||
    weeklyDigestDay < 0 ||
    weeklyDigestDay > 6
  ) {
    return {
      status: 400,
      body: { status: "error", error: "Weekly digest day must be 0–6." },
    };
  }
  if (
    !Number.isInteger(certificationWarningDays) ||
    certificationWarningDays < 1 ||
    certificationWarningDays > 365
  ) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "Certification warning days must be 1–365.",
      },
    };
  }
  if (
    !Number.isInteger(maintenanceWarningDays) ||
    maintenanceWarningDays < 1 ||
    maintenanceWarningDays > 365
  ) {
    return {
      status: 400,
      body: {
        status: "error",
        error: "Maintenance warning days must be 1–365.",
      },
    };
  }
  if (
    !Number.isInteger(maxEmailAttempts) ||
    maxEmailAttempts < 1 ||
    maxEmailAttempts > 10
  ) {
    return {
      status: 400,
      body: { status: "error", error: "Max email attempts must be 1–10." },
    };
  }

  const patch = {
    email_notifications_enabled: emailEnabled,
    sms_notifications_enabled: smsEnabled,
    push_notifications_enabled: Boolean(input.pushNotificationsEnabled),
    critical_alert_override_enabled: Boolean(
      input.criticalAlertOverrideEnabled,
    ),
    daily_digest_enabled: Boolean(input.dailyDigestEnabled),
    daily_digest_time:
      String(input.dailyDigestTime ?? "").trim() || "08:00:00",
    weekly_digest_enabled: Boolean(input.weeklyDigestEnabled),
    weekly_digest_day: weeklyDigestDay,
    weekly_digest_time:
      String(input.weeklyDigestTime ?? "").trim() || "08:00:00",
    timezone,
    certification_warning_days: certificationWarningDays,
    maintenance_warning_days: maintenanceWarningDays,
    max_email_attempts: maxEmailAttempts,
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_notification_settings")
    .upsert(
      { organization_id: auth.membership.organizationId, ...patch },
      { onConflict: "organization_id" },
    );

  if (error) {
    return { status: 400, body: { status: "error", error: error.message } };
  }

  await writeAuditLog(admin, {
    organizationId: auth.membership.organizationId,
    userId: auth.userId,
    action: AuditAction.NOTIFICATION_SETTINGS_UPDATED,
    entityType: AuditEntityType.NOTIFICATION_SETTINGS,
    entityId: auth.membership.organizationId,
    metadata: { via: "mobile", updated: true },
  });

  return { status: 200, body: { status: "ok" } };
}

export async function retryMobileNotificationDelivery(
  request: Request,
  input: { organizationId?: string | null; deliveryId?: string | null },
): Promise<{
  status: number;
  body:
    | MobileAuthFailure
    | { status: "ok" }
    | { status: "error"; error: string };
}> {
  const auth = await requireComposerMembership(
    request,
    input.organizationId ?? null,
  );
  if ("error" in auth) {
    return { status: auth.status, body: auth.error };
  }

  // History viewers can open history; retry mirrors web (administrators).
  if (
    !canViewNotificationHistory(auth.membership.role) ||
    !canRetryNotificationDelivery(auth.membership.role)
  ) {
    return {
      status: 403,
      body: {
        status: "forbidden",
        error: "Administrators can retry failed deliveries.",
      },
    };
  }

  const deliveryId = String(input.deliveryId ?? "").trim();
  if (!deliveryId) {
    return {
      status: 400,
      body: { status: "error", error: "Delivery is required." },
    };
  }

  const result = await retryFailedDelivery({
    deliveryId,
    organizationId: auth.membership.organizationId,
  });
  if (!result.ok) {
    return {
      status: 400,
      body: { status: "error", error: result.error ?? "Retry failed." },
    };
  }

  const admin = createAdminClient();
  await writeAuditLog(admin, {
    organizationId: auth.membership.organizationId,
    userId: auth.userId,
    action: AuditAction.NOTIFICATION_DELIVERY_RETRIED,
    entityType: AuditEntityType.NOTIFICATION_DELIVERY,
    entityId: deliveryId,
    metadata: { via: "mobile" },
  });

  return { status: 200, body: { status: "ok" } };
}

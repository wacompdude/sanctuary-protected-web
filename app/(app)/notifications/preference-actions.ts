"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { isNotificationChannel } from "@/lib/notifications/constants";
import { parseGroupSeverity } from "@/lib/notifications/groups/validation";
import { SMS_CONSENT_DISCLOSURE_VERSION } from "@/lib/notifications/endpoints/types";
import { syncMyNotificationEndpoints } from "@/lib/notifications/endpoints/sync";

function readCheckbox(formData: FormData, name: string): boolean {
  return (
    formData.get(name) === "on" ||
    formData.get(name) === "true" ||
    formData.get(name) === "1"
  );
}

function revalidatePrefs() {
  revalidatePath("/notifications/preferences");
  revalidatePath("/", "layout");
}

export async function syncMyEndpointsAction(): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const result = await syncMyNotificationEndpoints({
      supabase,
      churchId: church.id,
      user,
      membershipId: membership.id,
    });
    if (result.error) {
      if (/does not exist|schema cache/i.test(result.error)) {
        return {
          error:
            "Delivery endpoints are not configured yet. Run supabase/migrations/029_notification_groups.sql.",
        };
      }
      return { error: result.error };
    }
    revalidatePrefs();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to sync delivery endpoints.",
    };
  }
}

export async function setPrimaryEndpointAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user } = await getAuthenticatedUserWithChurch();
    const endpointId = String(formData.get("endpoint_id") ?? "").trim();
    if (!endpointId) return { error: "Endpoint is required." };

    const { data: endpoint, error: loadError } = await supabase
      .from("notification_endpoints")
      .select("id, channel, status")
      .eq("id", endpointId)
      .eq("church_id", church.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError || !endpoint) {
      return { error: loadError?.message ?? "Endpoint not found." };
    }

    const channel = String((endpoint as { channel: string }).channel);
    await supabase
      .from("notification_endpoints")
      .update({ is_primary: false })
      .eq("church_id", church.id)
      .eq("user_id", user.id)
      .eq("channel", channel);

    const { error } = await supabase
      .from("notification_endpoints")
      .update({ is_primary: true })
      .eq("id", endpointId)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_ENDPOINT_VERIFIED,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: endpointId,
      metadata: { channel, primary: true },
    });

    revalidatePrefs();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update primary endpoint.",
    };
  }
}

export async function disableEndpointAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user } = await getAuthenticatedUserWithChurch();
    const endpointId = String(formData.get("endpoint_id") ?? "").trim();
    if (!endpointId) return { error: "Endpoint is required." };

    const { error } = await supabase
      .from("notification_endpoints")
      .update({
        status: "disabled",
        is_primary: false,
      })
      .eq("id", endpointId)
      .eq("church_id", church.id)
      .eq("user_id", user.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_ENDPOINT_DISABLED,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: endpointId,
      metadata: { disabled: true },
    });

    revalidatePrefs();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to disable endpoint.",
    };
  }
}

export async function updateSmsConsentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user } = await getAuthenticatedUserWithChurch();
    const endpointId = String(formData.get("endpoint_id") ?? "").trim();
    const optIn = readCheckbox(formData, "sms_opt_in");
    if (!endpointId) return { error: "SMS endpoint is required." };

    const { data: endpoint, error: loadError } = await supabase
      .from("notification_endpoints")
      .select("id, channel")
      .eq("id", endpointId)
      .eq("church_id", church.id)
      .eq("user_id", user.id)
      .eq("channel", "sms")
      .maybeSingle();

    if (loadError || !endpoint) {
      return {
        error:
          loadError?.message ??
          "Add a phone number on your profile, then sync endpoints.",
      };
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("notification_endpoints")
      .update({
        consent_status: optIn ? "granted" : "revoked",
        consent_recorded_at: now,
        consent_source: "preferences_ui",
        consent_disclosure_version: SMS_CONSENT_DISCLOSURE_VERSION,
        // SMS delivery stays inactive until a provider is configured + verified.
        status: optIn ? "unverified" : "disabled",
        is_verified: false,
      })
      .eq("id", endpointId);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: optIn
        ? AuditAction.NOTIFICATION_SMS_OPTED_IN
        : AuditAction.NOTIFICATION_SMS_OPTED_OUT,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: endpointId,
      metadata: {
        disclosure_version: SMS_CONSENT_DISCLOSURE_VERSION,
        delivery_active: false,
      },
    });

    revalidatePrefs();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update SMS consent.",
    };
  }
}

export async function upsertGroupPreferenceRuleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    const groupId = String(formData.get("group_id") ?? "").trim() || null;
    const channelRaw = String(formData.get("channel") ?? "email").trim();
    if (!isNotificationChannel(channelRaw)) {
      return { error: "Select a valid channel." };
    }
    // SMS/push rules may be stored as preferences, but stay clearly inactive for delivery.
    const notificationType =
      String(formData.get("notification_type") ?? "*").trim() || "*";
    const severity =
      parseGroupSeverity(formData.get("minimum_severity")) ?? "informational";

    const payload = {
      church_id: church.id,
      user_id: user.id,
      membership_id: membership.id,
      group_id: groupId,
      notification_type: notificationType,
      channel: channelRaw,
      enabled: readCheckbox(formData, "enabled"),
      minimum_severity: severity,
      quiet_hours_enabled: readCheckbox(formData, "quiet_hours_enabled"),
      quiet_hours_start:
        String(formData.get("quiet_hours_start") ?? "").trim() || null,
      quiet_hours_end:
        String(formData.get("quiet_hours_end") ?? "").trim() || null,
      timezone:
        String(formData.get("timezone") ?? "America/Los_Angeles").trim() ||
        "America/Los_Angeles",
      digest_frequency:
        String(formData.get("digest_frequency") ?? "immediate").trim() ||
        "immediate",
    };

    let existingQuery = supabase
      .from("notification_preference_rules")
      .select("id")
      .eq("church_id", church.id)
      .eq("user_id", user.id)
      .eq("notification_type", notificationType)
      .eq("channel", channelRaw);

    existingQuery = groupId
      ? existingQuery.eq("group_id", groupId)
      : existingQuery.is("group_id", null);

    const { data: existing } = await existingQuery.maybeSingle();
    const existingId = existing
      ? String((existing as { id: string }).id)
      : null;

    if (existingId) {
      const { error } = await supabase
        .from("notification_preference_rules")
        .update(payload)
        .eq("id", existingId);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from("notification_preference_rules")
        .insert(payload);
      if (error) return { error: error.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_PREFERENCES_UPDATED,
      entityType: AuditEntityType.NOTIFICATION_SETTINGS,
      entityId: church.id,
      metadata: {
        scope: "preference_rule",
        group_id: groupId,
        channel: channelRaw,
        notification_type: notificationType,
      },
    });

    revalidatePrefs();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save group preference.",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  acknowledgeNotification,
  countUnreadNotifications,
  createNotification,
  markNotificationRead,
} from "@/lib/notifications";
import {
  canManageChurchNotificationSettings,
  canSendTestNotification,
  canViewNotificationHistory,
} from "@/lib/notifications/permissions";
import { auditNotificationTestEmailSent } from "@/lib/audit/notification-events";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";

function readCheckbox(formData: FormData, name: string): boolean {
  return (
    formData.get(name) === "on" ||
    formData.get(name) === "true" ||
    formData.get(name) === "1"
  );
}

export async function markNotificationReadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await getAuthenticatedUserWithChurch();
    const notificationId = String(formData.get("notification_id") ?? "").trim();
    if (!notificationId) return { error: "Notification is required." };

    const result = await markNotificationRead({
      supabase,
      notificationId,
      userId: user.id,
    });
    if (!result.ok) {
      return { error: result.error ?? "Unable to mark notification as read." };
    }
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to mark notification as read.",
    };
  }
}

export async function markNotificationReadFormAction(formData: FormData) {
  await markNotificationReadAction({}, formData);
}

export async function markNotificationUnreadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await getAuthenticatedUserWithChurch();
    const notificationId = String(formData.get("notification_id") ?? "").trim();
    if (!notificationId) return { error: "Notification is required." };

    const { error } = await supabase
      .from("notification_recipients")
      .update({ read_at: null })
      .eq("notification_id", notificationId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };

    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to mark notification as unread.",
    };
  }
}

export async function markNotificationUnreadFormAction(formData: FormData) {
  await markNotificationUnreadAction({}, formData);
}

export async function acknowledgeNotificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user, church } = await getAuthenticatedUserWithChurch();
    const notificationId = String(formData.get("notification_id") ?? "").trim();
    if (!notificationId) return { error: "Notification is required." };

    const result = await acknowledgeNotification({
      supabase,
      notificationId,
      userId: user.id,
    });
    if (!result.ok) return { error: result.error ?? "Unable to acknowledge." };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_ACKNOWLEDGED,
      entityType: AuditEntityType.NOTIFICATION,
      entityId: notificationId,
      metadata: { via: "notification_center" },
    });

    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to acknowledge notification.",
    };
  }
}

export async function acknowledgeNotificationFormAction(formData: FormData) {
  await acknowledgeNotificationAction({}, formData);
}

export async function dismissNotificationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, user } = await getAuthenticatedUserWithChurch();
    const notificationId = String(formData.get("notification_id") ?? "").trim();
    if (!notificationId) return { error: "Notification is required." };

    const { error } = await supabase
      .from("notification_recipients")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("notification_id", notificationId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };

    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to dismiss notification.",
    };
  }
}

export async function dismissNotificationFormAction(formData: FormData) {
  await dismissNotificationAction({}, formData);
}

export async function updateMyNotificationPreferencesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user } = await getAuthenticatedUserWithChurch();
    const notificationType =
      String(formData.get("notification_type") ?? "*").trim() || "*";
    const minimumSeverity = String(
      formData.get("minimum_severity") ?? "informational",
    ).trim();
    const digestFrequency = String(
      formData.get("digest_frequency") ?? "immediate",
    ).trim();
    const timezone = String(formData.get("timezone") ?? "UTC").trim();

    const payload = {
      church_id: church.id,
      user_id: user.id,
      notification_type: notificationType,
      email_enabled: readCheckbox(formData, "email_enabled"),
      sms_enabled: readCheckbox(formData, "sms_enabled"),
      push_enabled: readCheckbox(formData, "push_enabled"),
      in_app_enabled: readCheckbox(formData, "in_app_enabled"),
      minimum_severity: minimumSeverity,
      quiet_hours_enabled: readCheckbox(formData, "quiet_hours_enabled"),
      quiet_hours_start:
        String(formData.get("quiet_hours_start") ?? "").trim() || null,
      quiet_hours_end: String(formData.get("quiet_hours_end") ?? "").trim() || null,
      timezone,
      digest_frequency: digestFrequency,
    };

    const { error } = await supabase
      .from("notification_preferences")
      .upsert(payload, { onConflict: "church_id,user_id,notification_type" });
    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_PREFERENCES_UPDATED,
      entityType: AuditEntityType.NOTIFICATION_SETTINGS,
      entityId: church.id,
      metadata: { notification_type: notificationType },
    });

    revalidatePath("/notifications/preferences");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save notification preferences.",
    };
  }
}

export async function updateChurchNotificationSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    if (!canManageChurchNotificationSettings(membership.role)) {
      return { error: "You do not have permission to update notification settings." };
    }

    const patch = {
      default_sender_name:
        String(formData.get("default_sender_name") ?? "").trim() || null,
      reply_to_email: String(formData.get("reply_to_email") ?? "").trim() || null,
      email_notifications_enabled: readCheckbox(formData, "email_notifications_enabled"),
      sms_notifications_enabled: readCheckbox(formData, "sms_notifications_enabled"),
      push_notifications_enabled: readCheckbox(formData, "push_notifications_enabled"),
      critical_alert_override_enabled: readCheckbox(
        formData,
        "critical_alert_override_enabled",
      ),
      daily_digest_enabled: readCheckbox(formData, "daily_digest_enabled"),
      daily_digest_time:
        String(formData.get("daily_digest_time") ?? "").trim() || "08:00:00",
      weekly_digest_enabled: readCheckbox(formData, "weekly_digest_enabled"),
      weekly_digest_day: Number(formData.get("weekly_digest_day") ?? 1),
      weekly_digest_time:
        String(formData.get("weekly_digest_time") ?? "").trim() || "08:00:00",
      timezone: String(formData.get("timezone") ?? "UTC").trim(),
      certification_warning_days: Number(
        formData.get("certification_warning_days") ?? 60,
      ),
      maintenance_warning_days: Number(
        formData.get("maintenance_warning_days") ?? 30,
      ),
      max_email_attempts: Number(formData.get("max_email_attempts") ?? 3),
    };

    const { error } = await supabase
      .from("church_notification_settings")
      .upsert({ church_id: church.id, ...patch }, { onConflict: "church_id" });
    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_SETTINGS_UPDATED,
      entityType: AuditEntityType.NOTIFICATION_SETTINGS,
      entityId: church.id,
      metadata: { updated: true },
    });

    revalidatePath("/settings/notifications");
    revalidatePath("/notifications/settings");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to save notification settings.",
    };
  }
}

export async function sendTestNotificationEmailAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _prev;
  void _formData;
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    if (!canSendTestNotification(membership.role)) {
      return { error: "You do not have permission to send a test email." };
    }

    const unread = await countUnreadNotifications(supabase, church.id, user.id).catch(
      () => 0,
    );
    if (unread > 1000) {
      return { error: "Too many pending notifications; try again later." };
    }

    const result = await createNotification(
      {
        churchId: church.id,
        createdBy: user.id,
        notificationType: "notification.test",
        severity: "informational",
        templateKey: "notification.test",
        recipientUserIds: [user.id],
        deduplicationKey: `notification.test:${user.id}:${new Date()
          .toISOString()
          .slice(0, 16)}`,
        actionUrl: "/notifications",
      },
      { dispatchNow: true },
    );

    if (!result.notificationId) {
      return { error: result.error ?? "Unable to queue test notification." };
    }

    await auditNotificationTestEmailSent(supabase, {
      churchId: church.id,
      userId: user.id,
      notificationId: result.notificationId,
    });

    revalidatePath("/settings/notifications");
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to send test notification.",
    };
  }
}

export async function retryNotificationDeliveryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { church, membership, user, supabase } = await getAuthenticatedUserWithChurch();
    if (!canViewNotificationHistory(membership.role)) {
      return { error: "You do not have permission to retry deliveries." };
    }
    const deliveryId = String(formData.get("delivery_id") ?? "").trim();
    if (!deliveryId) return { error: "Delivery is required." };

    const { retryFailedDelivery } = await import("@/lib/notifications");
    const result = await retryFailedDelivery({ deliveryId, churchId: church.id });
    if (!result.ok) return { error: result.error ?? "Retry failed." };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_DELIVERY_RETRIED,
      entityType: AuditEntityType.NOTIFICATION_DELIVERY,
      entityId: deliveryId,
    });

    revalidatePath("/notifications/history");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to retry delivery.",
    };
  }
}

export async function retryNotificationDeliveryFormAction(formData: FormData) {
  await retryNotificationDeliveryAction({}, formData);
}

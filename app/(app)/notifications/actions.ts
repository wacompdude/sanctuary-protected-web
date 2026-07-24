"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  acknowledgeNotification,
  countUnreadNotifications,
  createNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import {
  canManageChurchNotificationSettings,
  canSendTestNotification,
  canViewNotificationHistory,
} from "@/lib/notifications/permissions";
import { auditNotificationTestEmailSent, auditEmailSenderTestFailed, auditEmailSenderTestSent } from "@/lib/audit/notification-events";
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

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  try {
    const { supabase, user, church } = await getAuthenticatedUserWithChurch();
    const result = await markAllNotificationsRead({
      supabase,
      churchId: church.id,
      userId: user.id,
    });
    if (!result.ok) {
      return { error: result.error ?? "Unable to clear notifications." };
    }
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to clear notifications.",
    };
  }
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

    // From / reply-to are controlled by the platform sender registry (lib/email).
    // Do not accept arbitrary sender addresses from church settings forms.
    const smsEnabled = readCheckbox(formData, "sms_notifications_enabled");
    if (smsEnabled) {
      const { FEATURE_KEYS } = await import("@/lib/subscriptions/feature-keys");
      const { requireFeature } = await import("@/lib/subscriptions/resolver");
      await requireFeature({
        churchId: church.id,
        featureKey: FEATURE_KEYS.SMS,
      });
    }
    const emailEnabled = readCheckbox(formData, "email_notifications_enabled");
    if (emailEnabled) {
      const { FEATURE_KEYS } = await import("@/lib/subscriptions/feature-keys");
      const { requireFeature } = await import("@/lib/subscriptions/resolver");
      await requireFeature({
        churchId: church.id,
        featureKey: FEATURE_KEYS.EMAIL,
      });
    }

    const patch = {
      email_notifications_enabled: emailEnabled,
      sms_notifications_enabled: smsEnabled,
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

const SENDER_TEST_COOLDOWN_MS = 60_000;
const SENDER_TEST_WINDOW_MS = 10 * 60_000;
const SENDER_TEST_WINDOW_MAX = 5;

async function assertSenderTestRateLimit(params: {
  supabase: Awaited<
    ReturnType<typeof getAuthenticatedUserWithChurch>
  >["supabase"];
  churchId: string;
  userId: string;
}): Promise<string | null> {
  const since = new Date(Date.now() - SENDER_TEST_WINDOW_MS).toISOString();
  const { data, error } = await params.supabase
    .from("audit_logs")
    .select("id, created_at, metadata")
    .eq("church_id", params.churchId)
    .eq("user_id", params.userId)
    .eq("action", AuditAction.EMAIL_SENDER_TEST_SENT)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SENDER_TEST_WINDOW_MAX + 1);

  if (error) {
    // Fail open on audit read errors would enable abuse; fail closed safely.
    return "Unable to verify sender test rate limit. Try again shortly.";
  }

  const rows = data ?? [];
  if (rows.length >= SENDER_TEST_WINDOW_MAX) {
    return "Too many sender tests. Wait a few minutes and try again.";
  }

  const latest = rows[0] as { created_at?: string } | undefined;
  if (latest?.created_at) {
    const elapsed = Date.now() - new Date(latest.created_at).getTime();
    if (elapsed < SENDER_TEST_COOLDOWN_MS) {
      return "Please wait at least one minute between sender tests.";
    }
  }

  return null;
}

export async function sendEmailSenderTestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    if (!canSendTestNotification(membership.role)) {
      return { error: "You do not have permission to send a sender test email." };
    }

    const { isEmailSenderCategory, EMAIL_SENDER_LABELS, resolveEmailSender } =
      await import("@/lib/email");
    const categoryRaw = String(formData.get("sender_category") ?? "").trim();
    if (!isEmailSenderCategory(categoryRaw)) {
      return { error: "Select a valid sender category." };
    }

    const senderLabel = EMAIL_SENDER_LABELS[categoryRaw];
    try {
      resolveEmailSender(categoryRaw);
    } catch {
      await auditEmailSenderTestFailed(supabase, {
        churchId: church.id,
        userId: user.id,
        senderCategory: categoryRaw,
        errorCode: "sender_not_configured",
      });
      return {
        error: "That sender category is not configured correctly on the server.",
      };
    }

    const rateLimitError = await assertSenderTestRateLimit({
      supabase,
      churchId: church.id,
      userId: user.id,
    });
    if (rateLimitError) return { error: rateLimitError };

    const result = await createNotification(
      {
        churchId: church.id,
        createdBy: user.id,
        notificationType: "notification.test",
        severity: "informational",
        // Avoid system notification.test template so the category appears in subject.
        templateKey: "email.sender_test",
        recipientUserIds: [user.id],
        requestedSenderCategory: categoryRaw,
        title: `Sanctuary Protected email sender test — ${senderLabel}`,
        body: [
          `Hello,`,
          ``,
          `This is a controlled Sanctuary Protected sender-category test.`,
          ``,
          `Sender category: ${senderLabel}`,
          `Church: ${church.name}`,
          ``,
          `If you received this message, the selected From address is working.`,
        ].join("\n"),
        deduplicationKey: `email.sender_test:${categoryRaw}:${user.id}:${new Date()
          .toISOString()
          .slice(0, 16)}`,
        actionUrl: "/settings/notifications",
      },
      { dispatchNow: true },
    );

    if (!result.notificationId) {
      await auditEmailSenderTestFailed(supabase, {
        churchId: church.id,
        userId: user.id,
        senderCategory: categoryRaw,
        errorCode: "create_failed",
      });
      return { error: result.error ?? "Unable to send sender test email." };
    }

    await auditEmailSenderTestSent(supabase, {
      churchId: church.id,
      userId: user.id,
      notificationId: result.notificationId,
      senderCategory: categoryRaw,
    });
    await auditNotificationTestEmailSent(supabase, {
      churchId: church.id,
      userId: user.id,
      notificationId: result.notificationId,
    });

    revalidatePath("/settings/notifications");
    revalidatePath("/notifications");
    revalidatePath("/notifications/history");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send sender test email.",
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
        requestedSenderCategory: "no_reply",
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

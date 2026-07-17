import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/church/types";
import {
  DEFAULT_NOTIFICATION_CHANNELS,
  getNotificationAppOrigin,
  templateKeyForNotificationType,
} from "@/lib/notifications/constants";
import {
  renderNotificationTemplate,
  wrapEmailHtml,
} from "@/lib/notifications/render-template";
import {
  applyRecipientPreferences,
  dedupeRecipients,
  resolveIncidentNotificationRecipients,
  resolveUsersByChurchRole,
  resolveUsersByIds,
} from "@/lib/notifications/resolve-recipients";
import {
  getChurchNotificationSettings,
  getNotificationTemplate,
} from "@/lib/notifications/settings";
import type {
  CreateNotificationInput,
  CreateNotificationResult,
  NotificationChannel,
  ResolvedRecipient,
} from "@/lib/notifications/types";
import {
  sanitizeNotificationMetadata,
  validateCreateNotificationInput,
} from "@/lib/notifications/validation";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

function absoluteActionUrl(actionUrl: string | null | undefined): string | null {
  if (!actionUrl) return null;
  if (actionUrl.startsWith("http://") || actionUrl.startsWith("https://")) {
    return actionUrl;
  }
  const origin = getNotificationAppOrigin();
  return `${origin}${actionUrl.startsWith("/") ? "" : "/"}${actionUrl}`;
}

async function writeClient(): Promise<SupabaseClient> {
  if (isServiceRoleConfigured()) {
    return createAdminClient();
  }
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

export async function createNotification(
  input: CreateNotificationInput,
  options?: { supabase?: SupabaseClient; dispatchNow?: boolean },
): Promise<CreateNotificationResult> {
  const validation = validateCreateNotificationInput(input);
  if (validation.error || !validation.severity || !validation.channels) {
    return {
      notificationId: null,
      status: "skipped",
      recipientCount: 0,
      deliveryCount: 0,
      error: validation.error ?? "Invalid notification input.",
    };
  }

  const severity = validation.severity;
  const channels = validation.channels.filter((channel) =>
    DEFAULT_NOTIFICATION_CHANNELS.includes(channel)
      ? true
      : channel === "in_app" || channel === "email",
  ) as NotificationChannel[];

  const supabase = options?.supabase ?? (await writeClient());

  try {
    const settings = await getChurchNotificationSettings(
      supabase,
      input.churchId,
    );

    const templateKey =
      input.templateKey ??
      templateKeyForNotificationType(input.notificationType);

    let title = input.title?.trim() ?? "";
    let body = input.body?.trim() ?? "";
    let summary = input.summary?.trim() ?? null;
    let templateVersion: number | null = null;
    let renderedEmail: {
      subject: string;
      text: string;
      html: string;
    } | null = null;

    const churchName =
      (await loadChurchName(supabase, input.churchId)) ?? "Your church";

    const template = await getNotificationTemplate(
      supabase,
      input.churchId,
      templateKey,
      "email",
    );

    const variables = {
      church_name: churchName,
      campus_name: "",
      campus_suffix: "",
      recipient_name: "there",
      action_url:
        absoluteActionUrl(input.actionUrl) ?? getNotificationAppOrigin(),
      ...(input.templateVariables ?? {}),
    };

    if (template) {
      const rendered = renderNotificationTemplate(template, variables, {
        severity,
      });
      title = title || rendered.subject;
      body = body || rendered.text;
      summary = summary ?? rendered.text.slice(0, 280);
      templateVersion = rendered.templateVersion;

      // Keep recipient token for per-delivery personalization at send time.
      const emailRendered = renderNotificationTemplate(
        template,
        { ...variables, recipient_name: "{{recipient_name}}" },
        { severity },
      );
      renderedEmail = {
        subject: emailRendered.subject,
        text: emailRendered.text,
        html: wrapEmailHtml(emailRendered.html, churchName),
      };
    }

    if (!title || !body) {
      return {
        notificationId: null,
        status: "skipped",
        recipientCount: 0,
        deliveryCount: 0,
        error:
          "Notification title and body are required when no template is available.",
      };
    }

    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        church_id: input.churchId,
        campus_id: input.campusId ?? null,
        created_by: input.createdBy ?? null,
        notification_type: input.notificationType,
        severity,
        title,
        body,
        summary,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        action_url: absoluteActionUrl(input.actionUrl),
        status: "pending",
        priority: severity === "critical" ? 100 : severity === "high" ? 50 : 0,
        requires_acknowledgment: Boolean(input.requiresAcknowledgment),
        acknowledgment_deadline: input.acknowledgmentDeadline ?? null,
        expires_at: input.expiresAt ?? null,
        scheduled_for: input.scheduledFor ?? null,
        deduplication_key: input.deduplicationKey ?? null,
        metadata: {
          ...sanitizeNotificationMetadata(input.metadata),
          email_subject: renderedEmail?.subject ?? title,
          email_text: renderedEmail?.text ?? body,
          email_html: renderedEmail?.html ?? null,
        },
        template_key: templateKey,
        template_version: templateVersion,
      })
      .select("id")
      .single();

    if (insertError || !notification) {
      if (
        insertError?.code === "23505" ||
        /duplicate|unique/i.test(insertError?.message ?? "")
      ) {
        return {
          notificationId: null,
          status: "duplicate",
          recipientCount: 0,
          deliveryCount: 0,
        };
      }
      return {
        notificationId: null,
        status: "skipped",
        recipientCount: 0,
        deliveryCount: 0,
        error:
          insertError?.message.includes("does not exist")
            ? "Notifications are not configured yet. Run supabase/migrations/027_notifications.sql."
            : insertError?.message ?? "Unable to create notification.",
      };
    }

    const notificationId = notification.id as string;

    let recipients = await resolveCreateRecipients(
      supabase,
      input,
      settings,
      severity,
    );
    recipients = await dedupeRecipients(recipients);

    const preferred = await applyRecipientPreferences({
      supabase,
      churchId: input.churchId,
      notificationType: input.notificationType,
      severity,
      settings,
      recipients,
    });

    const recipientRows = preferred.inApp.length
      ? preferred.inApp
      : recipients;

    const insertedRecipients: Array<{
      id: string;
      userId: string;
      email: string | null;
      displayName: string;
    }> = [];

    for (const recipient of recipientRows) {
      const { data: row, error: recipientError } = await supabase
        .from("notification_recipients")
        .insert({
          church_id: input.churchId,
          notification_id: notificationId,
          user_id: recipient.userId,
          recipient_type: "user",
          recipient_address: recipient.email,
          display_name: recipient.displayName,
          membership_id: recipient.membershipId,
          role_at_send: recipient.role,
        })
        .select("id, user_id, recipient_address, display_name")
        .single();

      if (recipientError || !row) {
        continue;
      }
      insertedRecipients.push({
        id: row.id as string,
        userId: row.user_id as string,
        email: (row.recipient_address as string | null) ?? null,
        displayName: (row.display_name as string) ?? recipient.displayName,
      });
    }

    let deliveryCount = 0;
    if (isServiceRoleConfigured()) {
      const admin = createAdminClient();
      const emailRecipientIds = new Set(
        preferred.email.map((recipient) => recipient.userId),
      );

      const deliveryInserts: Record<string, unknown>[] = [];
      for (const recipient of insertedRecipients) {
        if (channels.includes("in_app")) {
          deliveryInserts.push({
            church_id: input.churchId,
            notification_id: notificationId,
            recipient_id: recipient.id,
            channel: "in_app",
            provider: "internal",
            status: "delivered",
            attempt_number: 1,
            max_attempts: 1,
            delivered_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
          });
        }

        if (
          channels.includes("email") &&
          settings.email_notifications_enabled &&
          emailRecipientIds.has(recipient.userId) &&
          recipient.email
        ) {
          deliveryInserts.push({
            church_id: input.churchId,
            notification_id: notificationId,
            recipient_id: recipient.id,
            channel: "email",
            provider: (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase(),
            status: "pending",
            attempt_number: 0,
            max_attempts: settings.max_email_attempts,
            scheduled_for: input.scheduledFor ?? new Date().toISOString(),
          });
        }
      }

      if (deliveryInserts.length > 0) {
        const { data: deliveries, error: deliveryError } = await admin
          .from("notification_deliveries")
          .insert(deliveryInserts)
          .select("id");
        if (!deliveryError) {
          deliveryCount = deliveries?.length ?? 0;
        } else {
          console.error("createNotification deliveries failed:", deliveryError.message);
        }
      }
    }

    await supabase
      .from("notifications")
      .update({
        status: deliveryCount > 0 || insertedRecipients.length > 0 ? "queued" : "sent",
      })
      .eq("id", notificationId);

    if (options?.dispatchNow !== false && isServiceRoleConfigured()) {
      // Fire-and-forget; failures are recorded on delivery rows.
      void import("@/lib/notifications/dispatch-notification").then(
        ({ dispatchPendingDeliveries }) =>
          dispatchPendingDeliveries({
            limit: 25,
            notificationId,
          }).catch((error) => {
            console.error("dispatchPendingDeliveries failed:", error);
          }),
      );
    }

    return {
      notificationId,
      status: "queued",
      recipientCount: insertedRecipients.length,
      deliveryCount,
    };
  } catch (error) {
    return {
      notificationId: null,
      status: "skipped",
      recipientCount: 0,
      deliveryCount: 0,
      error:
        error instanceof Error ? error.message : "Unable to create notification.",
    };
  }
}

async function resolveCreateRecipients(
  supabase: SupabaseClient,
  input: CreateNotificationInput,
  settings: Awaited<ReturnType<typeof getChurchNotificationSettings>>,
  severity: NonNullable<CreateNotificationInput["severity"]>,
): Promise<ResolvedRecipient[]> {
  if (input.recipientUserIds?.length) {
    return resolveUsersByIds(supabase, input.churchId, input.recipientUserIds);
  }

  if (input.recipientRoles?.length) {
    return resolveUsersByChurchRole(
      supabase,
      input.churchId,
      input.recipientRoles as MembershipRole[],
    );
  }

  if (
    input.notificationType.startsWith("incident.") ||
    input.notificationType === "notification.test"
  ) {
    return resolveIncidentNotificationRecipients(
      supabase,
      input.churchId,
      settings,
      severity,
    );
  }

  return resolveUsersByChurchRole(supabase, input.churchId, [
    "owner",
    "administrator",
    "security_leader",
  ]);
}

async function loadChurchName(
  supabase: SupabaseClient,
  churchId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("churches")
    .select("name, display_name")
    .eq("id", churchId)
    .maybeSingle();
  if (!data) return null;
  const row = data as { name?: string; display_name?: string | null };
  return row.display_name?.trim() || row.name || null;
}

export async function markNotificationRead(params: {
  supabase: SupabaseClient;
  notificationId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await params.supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("notification_id", params.notificationId)
    .eq("user_id", params.userId)
    .is("read_at", null);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function acknowledgeNotification(params: {
  supabase: SupabaseClient;
  notificationId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await params.supabase
    .from("notification_recipients")
    .update({
      acknowledged_at: now,
      read_at: now,
    })
    .eq("notification_id", params.notificationId)
    .eq("user_id", params.userId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cancelNotification(params: {
  supabase: SupabaseClient;
  notificationId: string;
  churchId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await params.supabase
    .from("notifications")
    .update({
      status: "cancelled",
      cancelled_at: now,
    })
    .eq("id", params.notificationId)
    .eq("church_id", params.churchId);

  if (error) return { ok: false, error: error.message };

  if (isServiceRoleConfigured()) {
    const admin = createAdminClient();
    await admin
      .from("notification_deliveries")
      .update({ status: "cancelled", updated_at: now })
      .eq("notification_id", params.notificationId)
      .in("status", ["pending", "queued", "processing"]);
  }

  return { ok: true };
}

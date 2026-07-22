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
  resolveNotificationAudience,
  resolveSystemGroupIdsForRoles,
  type NotificationTargetInput,
} from "@/lib/notifications/resolve-audience";
import {
  getChurchNotificationSettings,
  getNotificationTemplate,
} from "@/lib/notifications/settings";
import type {
  CreateNotificationInput,
  CreateNotificationResult,
  NotificationChannel,
  NotificationSeverity,
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

  // Prefer service-role writes so creation is not blocked by caller RLS
  // (e.g. security_member creating an incident) and email delivery rows can be inserted.
  const supabase = isServiceRoleConfigured()
    ? createAdminClient()
    : (options?.supabase ?? (await writeClient()));

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

    const templateSenderCategory =
      template?.default_sender_category &&
      typeof template.default_sender_category === "string"
        ? template.default_sender_category
        : null;

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
          ...(input.requestedSenderCategory
            ? { requested_sender_category: input.requestedSenderCategory }
            : {}),
          ...(templateSenderCategory
            ? { template_default_sender_category: templateSenderCategory }
            : {}),
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

    const targets = await buildNotificationTargets(
      supabase,
      input,
      settings,
      severity,
    );

    await writeNotificationTargets(
      supabase,
      input.churchId,
      notificationId,
      targets,
    );

    const audience = await resolveNotificationAudience({
      supabase,
      churchId: input.churchId,
      notificationType: input.notificationType,
      severity,
      settings,
      channels,
      targets,
    });

    const recipientIdByUser = new Map<string, string>();
    for (const member of audience.members) {
      const emailDelivery = audience.deliveries.find(
        (row) =>
          row.userId === member.userId &&
          row.channel === "email" &&
          row.status === "pending",
      );
      const { data: row, error: recipientError } = await supabase
        .from("notification_recipients")
        .insert({
          church_id: input.churchId,
          notification_id: notificationId,
          user_id: member.userId,
          recipient_type: "user",
          recipient_address: emailDelivery?.destination ?? null,
          display_name: member.displayName,
          membership_id: member.membershipId,
          role_at_send: member.role,
          groups_at_send: member.sourceGroups,
          preference_rule_applied:
            audience.deliveries.find((d) => d.userId === member.userId)
              ?.preferenceRuleApplied ?? null,
          override_applied: audience.deliveries.some(
            (d) => d.userId === member.userId && d.overrideApplied,
          ),
          resolution_metadata: {
            source_groups: member.sourceGroups,
            used_groups: audience.usedGroups,
          },
        })
        .select("id")
        .single();

      if (!recipientError && row) {
        recipientIdByUser.set(member.userId, row.id as string);
      }
    }

    let deliveryCount = 0;
    if (isServiceRoleConfigured() && recipientIdByUser.size > 0) {
      const admin = createAdminClient();
      const deliveryInserts: Record<string, unknown>[] = [];

      for (const planned of audience.deliveries) {
        const recipientId = recipientIdByUser.get(planned.userId);
        if (!recipientId) continue;

        // Persist suppressions for auditability, but only for email/sms/push.
        // In-app suppressions are skipped to avoid noise; delivered in-app is kept.
        if (planned.status === "suppressed" && planned.channel === "in_app") {
          continue;
        }

        if (planned.channel === "in_app" && planned.status === "delivered") {
          deliveryInserts.push({
            church_id: input.churchId,
            notification_id: notificationId,
            recipient_id: recipientId,
            channel: "in_app",
            provider: "internal",
            status: "delivered",
            attempt_number: 1,
            max_attempts: 1,
            delivered_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            endpoint_id: null,
            normalized_destination: "in_app",
            source_groups: planned.sourceGroups,
            preference_rule_applied: planned.preferenceRuleApplied,
            override_applied: planned.overrideApplied,
          });
          continue;
        }

        if (planned.channel === "email" && planned.status === "pending") {
          deliveryInserts.push({
            church_id: input.churchId,
            notification_id: notificationId,
            recipient_id: recipientId,
            channel: "email",
            provider: (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase(),
            status: "pending",
            attempt_number: 0,
            max_attempts: settings.max_email_attempts,
            scheduled_for: input.scheduledFor ?? new Date().toISOString(),
            endpoint_id: planned.endpointId,
            normalized_destination: planned.normalizedDestination,
            source_groups: planned.sourceGroups,
            preference_rule_applied: planned.preferenceRuleApplied,
            override_applied: planned.overrideApplied,
          });
          continue;
        }

        if (planned.status === "suppressed") {
          deliveryInserts.push({
            church_id: input.churchId,
            notification_id: notificationId,
            recipient_id: recipientId,
            channel: planned.channel,
            provider:
              planned.channel === "email"
                ? (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase()
                : planned.channel === "sms"
                  ? "sms_placeholder"
                  : planned.channel === "push"
                    ? "push_placeholder"
                    : "internal",
            status: "suppressed",
            attempt_number: 0,
            max_attempts: 1,
            endpoint_id: planned.endpointId,
            normalized_destination: planned.normalizedDestination,
            source_groups: planned.sourceGroups,
            preference_rule_applied: planned.preferenceRuleApplied,
            override_applied: planned.overrideApplied,
            suppression_reason: planned.suppressionReason ?? "other",
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
          console.error(
            "createNotification deliveries failed:",
            deliveryError.message,
          );
        }
      }
    }

    const actionableDeliveries = audience.deliveries.filter(
      (row) => row.status === "pending" || row.status === "delivered",
    ).length;

    await supabase
      .from("notifications")
      .update({
        status:
          actionableDeliveries > 0 || recipientIdByUser.size > 0
            ? "queued"
            : "sent",
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
      recipientCount: recipientIdByUser.size,
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

async function buildNotificationTargets(
  supabase: SupabaseClient,
  input: CreateNotificationInput,
  settings: Awaited<ReturnType<typeof getChurchNotificationSettings>>,
  severity: NotificationSeverity,
): Promise<NotificationTargetInput> {
  if (input.targetGroupIds?.length || input.targetMembershipIds?.length) {
    return {
      groupIds: input.targetGroupIds,
      membershipIds: input.targetMembershipIds,
      userIds: input.recipientUserIds,
      roles: input.recipientRoles,
    };
  }

  if (input.recipientUserIds?.length) {
    return { userIds: input.recipientUserIds };
  }

  const roles: MembershipRole[] = input.recipientRoles?.length
    ? (input.recipientRoles as MembershipRole[])
    : input.notificationType.startsWith("incident.") ||
        input.notificationType === "notification.test"
      ? ((severity === "critical"
          ? settings.default_critical_notification_roles
          : settings.default_incident_notification_roles) as MembershipRole[])
      : ["owner", "co_owner", "administrator", "security_leader"];

  const groupIds = await resolveSystemGroupIdsForRoles(
    supabase,
    input.churchId,
    roles,
  );

  if (groupIds.length > 0) {
    return { groupIds, roles };
  }

  return { roles };
}

async function writeNotificationTargets(
  supabase: SupabaseClient,
  churchId: string,
  notificationId: string,
  targets: NotificationTargetInput,
): Promise<void> {
  const rows: Record<string, unknown>[] = [];

  for (const groupId of targets.groupIds ?? []) {
    rows.push({
      church_id: churchId,
      notification_id: notificationId,
      target_type: "group",
      group_id: groupId,
    });
  }
  for (const membershipId of targets.membershipIds ?? []) {
    rows.push({
      church_id: churchId,
      notification_id: notificationId,
      target_type: "member",
      membership_id: membershipId,
    });
  }
  for (const userId of targets.userIds ?? []) {
    rows.push({
      church_id: churchId,
      notification_id: notificationId,
      target_type: "user",
      user_id: userId,
    });
  }
  for (const role of targets.roles ?? []) {
    rows.push({
      church_id: churchId,
      notification_id: notificationId,
      target_type: "role",
      role,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("notification_targets").insert(rows);
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.error("writeNotificationTargets failed:", error.message);
  }
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

export async function markAllNotificationsRead(params: {
  supabase: SupabaseClient;
  churchId: string;
  userId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await params.supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .eq("church_id", params.churchId)
    .eq("user_id", params.userId)
    .is("read_at", null)
    .is("dismissed_at", null);

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

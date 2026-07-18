"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import {
  canCreateOperationalNotifications,
  canManageChurchNotificationSettings,
} from "@/lib/notifications/permissions";
import { createNotification } from "@/lib/notifications/create-notification";
import {
  resolveNotificationAudience,
  type NotificationTargetInput,
} from "@/lib/notifications/resolve-audience";
import { getChurchNotificationSettings } from "@/lib/notifications/settings";
import {
  isNotificationChannel,
  isNotificationSeverity,
} from "@/lib/notifications/constants";
import type { NotificationChannel } from "@/lib/notifications/types";

export type AudiencePreviewResult = {
  error?: string;
  preview?: {
    uniqueMembers: number;
    emailPending: number;
    emailSuppressed: number;
    inAppDelivered: number;
    smsSuppressed: number;
    pushSuppressed: number;
    selectedGroups: Array<{ id: string; name: string }>;
    suppressionBreakdown: Array<{ reason: string; count: number }>;
    overrideCount: number;
    usedGroups: boolean;
  };
};

function readCheckbox(formData: FormData, name: string): boolean {
  return (
    formData.get(name) === "on" ||
    formData.get(name) === "true" ||
    formData.get(name) === "1"
  );
}

function parseComposerTargets(formData: FormData): NotificationTargetInput {
  const groupIds = formData
    .getAll("group_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const membershipIds = formData
    .getAll("membership_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  return { groupIds, membershipIds };
}

function parseChannels(formData: FormData): NotificationChannel[] {
  const selected = formData
    .getAll("channels")
    .map((value) => String(value).trim())
    .filter((value): value is NotificationChannel =>
      isNotificationChannel(value),
    );
  if (selected.length === 0) return ["in_app", "email"];
  // Composer never actually sends SMS/push yet.
  return selected.filter(
    (channel) => channel === "in_app" || channel === "email",
  );
}

async function loadGroupNames(
  churchId: string,
  groupIds: string[],
): Promise<Array<{ id: string; name: string }>> {
  if (groupIds.length === 0) return [];
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data } = await supabase
    .from("notification_groups")
    .select("id, name")
    .eq("church_id", churchId)
    .in("id", groupIds);
  return ((data ?? []) as Array<{ id: string; name: string }>).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

export async function previewNotificationAudienceAction(
  formData: FormData,
): Promise<AudiencePreviewResult> {
  try {
    const { supabase, church, membership } =
      await getAuthenticatedUserWithChurch();
    if (!canCreateOperationalNotifications(membership.role)) {
      return { error: "You do not have permission to compose notifications." };
    }

    const targets = parseComposerTargets(formData);
    if (
      !(targets.groupIds?.length) &&
      !(targets.membershipIds?.length)
    ) {
      return { error: "Select at least one notification group or member." };
    }

    const severityRaw = String(formData.get("severity") ?? "informational").trim();
    const severity = isNotificationSeverity(severityRaw)
      ? severityRaw
      : "informational";
    const notificationType =
      String(formData.get("notification_type") ?? "general.announcement").trim() ||
      "general.announcement";
    const channels = parseChannels(formData);
    const settings = await getChurchNotificationSettings(supabase, church.id);

    const audience = await resolveNotificationAudience({
      supabase,
      churchId: church.id,
      notificationType,
      severity,
      settings,
      channels,
      targets,
    });

    const suppressionBreakdownMap = new Map<string, number>();
    for (const row of audience.deliveries) {
      if (row.status !== "suppressed" || !row.suppressionReason) continue;
      suppressionBreakdownMap.set(
        row.suppressionReason,
        (suppressionBreakdownMap.get(row.suppressionReason) ?? 0) + 1,
      );
    }

    const selectedGroups = await loadGroupNames(
      church.id,
      targets.groupIds ?? [],
    );

    return {
      preview: {
        uniqueMembers: audience.members.length,
        emailPending: audience.deliveries.filter(
          (row) => row.channel === "email" && row.status === "pending",
        ).length,
        emailSuppressed: audience.deliveries.filter(
          (row) => row.channel === "email" && row.status === "suppressed",
        ).length,
        inAppDelivered: audience.deliveries.filter(
          (row) => row.channel === "in_app" && row.status === "delivered",
        ).length,
        smsSuppressed: audience.deliveries.filter(
          (row) => row.channel === "sms",
        ).length,
        pushSuppressed: audience.deliveries.filter(
          (row) => row.channel === "push",
        ).length,
        selectedGroups,
        suppressionBreakdown: [...suppressionBreakdownMap.entries()].map(
          ([reason, count]) => ({ reason, count }),
        ),
        overrideCount: audience.deliveries.filter((row) => row.overrideApplied)
          .length,
        usedGroups: audience.usedGroups,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to preview audience.",
    };
  }
}

export async function sendComposedNotificationAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  let notificationId: string | null = null;
  try {
    const { supabase, church, user, membership } =
      await getAuthenticatedUserWithChurch();
    if (!canCreateOperationalNotifications(membership.role)) {
      return { error: "You do not have permission to send notifications." };
    }

    const targets = parseComposerTargets(formData);
    if (
      !(targets.groupIds?.length) &&
      !(targets.membershipIds?.length)
    ) {
      return { error: "Select at least one notification group or member." };
    }

    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!title || !body) {
      return { error: "Title and message are required." };
    }

    let severityRaw = String(formData.get("severity") ?? "informational").trim();
    const emergency =
      readCheckbox(formData, "emergency_override") &&
      canManageChurchNotificationSettings(membership.role);
    if (emergency) {
      severityRaw = "critical";
    }
    if (!isNotificationSeverity(severityRaw)) {
      return { error: "Select a valid severity." };
    }

    const notificationType =
      String(formData.get("notification_type") ?? "general.announcement").trim() ||
      "general.announcement";
    const actionUrl = String(formData.get("action_url") ?? "").trim() || null;
    const channels = parseChannels(formData);
    const scheduledRaw = String(formData.get("scheduled_for") ?? "").trim();
    const scheduledFor = scheduledRaw
      ? new Date(scheduledRaw).toISOString()
      : null;
    if (scheduledRaw && Number.isNaN(Date.parse(scheduledRaw))) {
      return { error: "Scheduled time is invalid." };
    }

    const result = await createNotification(
      {
        churchId: church.id,
        createdBy: user.id,
        notificationType,
        severity: severityRaw,
        title,
        body,
        summary: body.slice(0, 280),
        actionUrl,
        channels,
        targetGroupIds: targets.groupIds,
        targetMembershipIds: targets.membershipIds,
        requiresAcknowledgment: readCheckbox(formData, "requires_acknowledgment"),
        scheduledFor,
        deduplicationKey: `composer:${church.id}:${notificationType}:${Date.now()}`,
        metadata: {
          composer: true,
          emergency_override_requested: emergency,
        },
      },
      { dispatchNow: !scheduledFor },
    );

    if (!result.notificationId) {
      return {
        error:
          result.error ??
          (result.status === "duplicate"
            ? "A duplicate notification was skipped."
            : "Unable to send notification."),
      };
    }

    notificationId = result.notificationId;

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_CREATED,
      entityType: AuditEntityType.NOTIFICATION,
      entityId: notificationId,
      metadata: {
        via: "composer",
        recipient_count: result.recipientCount,
        delivery_count: result.deliveryCount,
        group_count: targets.groupIds?.length ?? 0,
        emergency,
      },
    });

    revalidatePath("/notifications");
    revalidatePath("/notifications/history");
    revalidatePath(`/notifications/${notificationId}`);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send notification.",
    };
  }

  redirect(
    notificationId
      ? `/notifications/${notificationId}`
      : "/notifications",
  );
}

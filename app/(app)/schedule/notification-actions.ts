"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
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
import { canManageSchedule } from "@/lib/schedule/permissions";
import type { ScheduleActionState } from "@/lib/schedule/types";

function readCheckbox(formData: FormData, name: string): boolean {
  return (
    formData.get(name) === "on" ||
    formData.get(name) === "true" ||
    formData.get(name) === "1"
  );
}

function parseTargets(formData: FormData): NotificationTargetInput {
  return {
    groupIds: formData
      .getAll("group_ids")
      .map((value) => String(value).trim())
      .filter(Boolean),
    membershipIds: formData
      .getAll("membership_ids")
      .map((value) => String(value).trim())
      .filter(Boolean),
  };
}

function parseChannels(formData: FormData): NotificationChannel[] {
  const selected = formData
    .getAll("channels")
    .map((value) => String(value).trim())
    .filter((value): value is NotificationChannel =>
      isNotificationChannel(value),
    );
  if (selected.length === 0) return ["in_app", "email"];
  return selected.filter(
    (channel) => channel === "in_app" || channel === "email",
  );
}

export type ScheduleAudiencePreview = {
  error?: string;
  preview?: {
    uniqueMembers: number;
    emailPending: number;
    emailSuppressed: number;
  };
};

export async function previewScheduleAudienceAction(
  formData: FormData,
): Promise<ScheduleAudiencePreview> {
  try {
    const { church, membership, supabase } =
      await getAuthenticatedUserWithChurch();
    if (!canManageSchedule(membership.role)) {
      return { error: "You do not have permission to send schedule notifications." };
    }

    const settings = await getChurchNotificationSettings(supabase, church.id);
    const targets = parseTargets(formData);
    if (
      (targets.groupIds?.length ?? 0) === 0 &&
      (targets.membershipIds?.length ?? 0) === 0
    ) {
      return { error: "Select at least one group or member." };
    }

    const audience = await resolveNotificationAudience({
      supabase,
      churchId: church.id,
      settings,
      notificationType: "schedule.custom_message",
      severity: "medium",
      channels: parseChannels(formData),
      targets,
    });

    const emailPending = audience.deliveries.filter(
      (d) => d.channel === "email" && d.status === "pending",
    ).length;
    const emailSuppressed = audience.deliveries.filter(
      (d) => d.channel === "email" && d.status === "suppressed",
    ).length;

    return {
      preview: {
        uniqueMembers: audience.members.length,
        emailPending,
        emailSuppressed,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to preview audience.",
    };
  }
}

export async function sendScheduleCustomNotificationAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church, membership, supabase } =
      await getAuthenticatedUserWithChurch();
    if (!canManageSchedule(membership.role)) {
      return { error: "You do not have permission to send schedule notifications." };
    }

    const { FEATURE_KEYS } = await import("@/lib/subscriptions/feature-keys");
    const { requireFeature } = await import("@/lib/subscriptions/resolver");
    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.TEAM_SCHEDULING,
    });
    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.EMAIL,
    });

    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    if (!subject || subject.length > 200) {
      return {
        error: "Enter a subject (max 200 characters).",
        fieldErrors: { subject: "Required (max 200)." },
      };
    }
    if (!message || message.length > 4000) {
      return {
        error: "Enter a message (max 4000 characters).",
        fieldErrors: { message: "Required (max 4000)." },
      };
    }

    // Block obvious secret patterns
    if (
      /password|alarm\s*code|encryption|radio\s*key|door\s*code|access\s*code/i.test(
        message,
      )
    ) {
      return {
        error:
          "Do not include passwords, alarm codes, or other security secrets in schedule emails.",
        fieldErrors: { message: "Remove sensitive credentials." },
      };
    }

    const severityRaw = String(formData.get("severity") ?? "medium").trim();
    if (!isNotificationSeverity(severityRaw)) {
      return { error: "Select a valid severity." };
    }

    const eventId = String(formData.get("event_id") ?? "").trim() || null;
    const shiftId = String(formData.get("shift_id") ?? "").trim() || null;
    const actionUrl =
      String(formData.get("action_url") ?? "").trim() ||
      (shiftId
        ? `/schedule/shifts/${shiftId}`
        : eventId
          ? `/schedule/events/${eventId}`
          : "/schedule/calendar");

    let scheduledFor: string | null = null;
    const sendLater = readCheckbox(formData, "send_later");
    if (sendLater) {
      const when = String(formData.get("scheduled_for") ?? "").trim();
      if (!when) {
        return {
          error: "Choose a send time or uncheck schedule for later.",
          fieldErrors: { scheduled_for: "Required when scheduling later." },
        };
      }
      const parsed = new Date(when);
      if (Number.isNaN(parsed.getTime())) {
        return { error: "Invalid scheduled send time." };
      }
      scheduledFor = parsed.toISOString();
    }

    const targets = parseTargets(formData);
    if (
      (targets.groupIds?.length ?? 0) === 0 &&
      (targets.membershipIds?.length ?? 0) === 0
    ) {
      return { error: "Select at least one group or member." };
    }

    // Expand assigned members for selected shift when requested
    const includeAssigned = readCheckbox(formData, "include_assigned_shift");
    if (includeAssigned && shiftId) {
      const { data: assigned } = await supabase
        .from("shift_assignments")
        .select("membership_id")
        .eq("church_id", church.id)
        .eq("shift_id", shiftId)
        .not("status", "in", '("declined","cancelled")');
      const extra = (assigned ?? [])
        .map((row) => row.membership_id as string | null)
        .filter((id): id is string => Boolean(id));
      targets.membershipIds = [
        ...new Set([...(targets.membershipIds ?? []), ...extra]),
      ];
    }

    const result = await createNotification({
      churchId: church.id,
      createdBy: user.id,
      notificationType: "schedule.custom_message",
      severity: severityRaw,
      title: subject,
      body: message,
      summary: message.slice(0, 240),
      entityType: shiftId ? "schedule_shift" : eventId ? "schedule_event" : null,
      entityId: shiftId ?? eventId,
      actionUrl,
      scheduledFor,
      targetGroupIds: targets.groupIds,
      targetMembershipIds: targets.membershipIds,
      channels: parseChannels(formData),
      requiresAcknowledgment: readCheckbox(formData, "requires_acknowledgment"),
      templateVariables: {
        subject,
        custom_message: message,
        event_title: "",
        shift_title: "",
      },
      metadata: {
        source: "schedule_composer",
        event_id: eventId,
        shift_id: shiftId,
      },
    });

    if (result.error || !result.notificationId) {
      return {
        error: result.error ?? "Unable to create the notification.",
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.NOTIFICATION_CREATED,
      entityType: AuditEntityType.NOTIFICATION,
      entityId: result.notificationId,
      metadata: {
        notification_type: "schedule.custom_message",
        recipient_count: result.recipientCount,
        delivery_count: result.deliveryCount,
      },
    });

    revalidatePath("/schedule/notifications");
    revalidatePath("/notifications");
    revalidatePath("/notifications/history");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to send schedule notification.",
    };
  }
}

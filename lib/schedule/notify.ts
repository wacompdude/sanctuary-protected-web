import { createNotification } from "@/lib/notifications/create-notification";
import type { NotificationType } from "@/lib/notifications/types";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { labelForScheduleAssignmentRole } from "@/lib/schedule/constants";
import type { ScheduleShift } from "@/lib/schedule/types";

type ScheduleNotifyBase = {
  churchId: string;
  createdBy?: string | null;
  timeZone?: string | null;
  customMessage?: string | null;
};

function fmt(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return "—";
  return formatChurchDateTime(iso, { timeZone: timeZone ?? undefined });
}

/**
 * Fire-and-forget schedule notification. Never throws into product flows.
 */
export async function notifyScheduleSafe(
  input: Parameters<typeof createNotification>[0],
): Promise<void> {
  try {
    const result = await createNotification(input);
    if (result.error) {
      console.error("schedule notification failed:", result.error, {
        type: input.notificationType,
        churchId: input.churchId,
      });
    }
  } catch (error) {
    console.error("schedule notification threw:", error);
  }
}

export async function notifyAssignmentCreated(params: ScheduleNotifyBase & {
  shift: ScheduleShift;
  assignmentId: string;
  recipientUserId: string;
  assignmentRole: string;
  eventTitle?: string | null;
  campusName?: string | null;
  conflictOverride?: boolean;
}): Promise<void> {
  const type: NotificationType = params.conflictOverride
    ? "schedule.conflict_override"
    : "schedule.assignment_created";
  const responseRequired = !params.conflictOverride;

  await notifyScheduleSafe({
    churchId: params.churchId,
    createdBy: params.createdBy,
    notificationType: type,
    severity: params.conflictOverride ? "high" : "medium",
    entityType: "shift_assignment",
    entityId: params.assignmentId,
    actionUrl: `/schedule/my-schedule`,
    recipientUserIds: [params.recipientUserId],
    channels: ["in_app", "email"],
    deduplicationKey: `${type}:${params.assignmentId}`,
    templateVariables: {
      shift_title: params.shift.title,
      event_title: params.eventTitle ?? "",
      shift_start: fmt(params.shift.start_at, params.timeZone),
      shift_end: fmt(params.shift.end_at, params.timeZone),
      campus_name: params.campusName ?? "",
      location_name: params.shift.location_name ?? "",
      assignment_role: labelForScheduleAssignmentRole(params.assignmentRole),
      custom_message: params.customMessage ?? "",
    },
    metadata: {
      shift_id: params.shift.id,
      assignment_id: params.assignmentId,
      response_required: responseRequired,
    },
  });

  if (responseRequired) {
    await notifyScheduleSafe({
      churchId: params.churchId,
      createdBy: params.createdBy,
      notificationType: "schedule.assignment_response_required",
      severity: "high",
      entityType: "shift_assignment",
      entityId: params.assignmentId,
      actionUrl: `/schedule/my-schedule`,
      recipientUserIds: [params.recipientUserId],
      channels: ["in_app", "email"],
      deduplicationKey: `schedule.assignment_response_required:${params.assignmentId}`,
      templateVariables: {
        shift_title: params.shift.title,
        shift_start: fmt(params.shift.start_at, params.timeZone),
        shift_end: fmt(params.shift.end_at, params.timeZone),
      },
    });
  }
}

export async function notifyAssignmentCancelled(params: ScheduleNotifyBase & {
  shift: ScheduleShift;
  assignmentId: string;
  recipientUserId: string;
}): Promise<void> {
  await notifyScheduleSafe({
    churchId: params.churchId,
    createdBy: params.createdBy,
    notificationType: "schedule.assignment_cancelled",
    severity: "high",
    entityType: "shift_assignment",
    entityId: params.assignmentId,
    actionUrl: `/schedule/shifts/${params.shift.id}`,
    recipientUserIds: [params.recipientUserId],
    channels: ["in_app", "email"],
    deduplicationKey: `schedule.assignment_cancelled:${params.assignmentId}`,
    templateVariables: {
      shift_title: params.shift.title,
      shift_start: fmt(params.shift.start_at, params.timeZone),
      shift_end: fmt(params.shift.end_at, params.timeZone),
      custom_message: params.customMessage ?? "",
    },
  });
}

export async function notifyAssignmentResponse(params: ScheduleNotifyBase & {
  shiftId: string;
  shiftTitle: string;
  assignmentId: string;
  decision: "accept" | "decline";
  memberName: string;
  schedulerUserIds: string[];
}): Promise<void> {
  if (params.schedulerUserIds.length === 0) return;
  await notifyScheduleSafe({
    churchId: params.churchId,
    createdBy: params.createdBy,
    notificationType:
      params.decision === "accept"
        ? "schedule.assignment_accepted"
        : "schedule.assignment_declined",
    severity: "medium",
    entityType: "shift_assignment",
    entityId: params.assignmentId,
    actionUrl: `/schedule/shifts/${params.shiftId}`,
    recipientUserIds: params.schedulerUserIds,
    channels: ["in_app", "email"],
    title:
      params.decision === "accept"
        ? `${params.memberName} accepted a shift`
        : `${params.memberName} declined a shift`,
    body: `${params.memberName} ${params.decision === "accept" ? "accepted" : "declined"} “${params.shiftTitle}”.`,
    templateVariables: {
      shift_title: params.shiftTitle,
      recipient_name: "there",
      custom_message: `${params.memberName} ${params.decision === "accept" ? "accepted" : "declined"} the assignment.`,
      subject:
        params.decision === "accept"
          ? `Accepted: ${params.shiftTitle}`
          : `Declined: ${params.shiftTitle}`,
    },
  });
}

export async function notifyShiftCancelled(params: ScheduleNotifyBase & {
  shift: ScheduleShift;
  recipientUserIds: string[];
}): Promise<void> {
  if (params.recipientUserIds.length === 0) return;
  await notifyScheduleSafe({
    churchId: params.churchId,
    createdBy: params.createdBy,
    notificationType: "schedule.shift_cancelled",
    severity: "high",
    entityType: "schedule_shift",
    entityId: params.shift.id,
    actionUrl: `/schedule/shifts/${params.shift.id}`,
    recipientUserIds: params.recipientUserIds,
    channels: ["in_app", "email"],
    title: `Shift cancelled: ${params.shift.title}`,
    body: `The shift “${params.shift.title}” was cancelled.`,
    templateKey: "schedule.assignment_cancelled",
    templateVariables: {
      shift_title: params.shift.title,
      shift_start: fmt(params.shift.start_at, params.timeZone),
      shift_end: fmt(params.shift.end_at, params.timeZone),
      custom_message: params.customMessage ?? "This shift has been cancelled.",
    },
    deduplicationKey: `schedule.shift_cancelled:${params.shift.id}`,
  });
}

export async function notifyEventCancelled(params: ScheduleNotifyBase & {
  eventId: string;
  eventTitle: string;
  eventStart: string;
  eventEnd: string;
  recipientUserIds: string[];
}): Promise<void> {
  if (params.recipientUserIds.length === 0) return;
  await notifyScheduleSafe({
    churchId: params.churchId,
    createdBy: params.createdBy,
    notificationType: "schedule.event_cancelled",
    severity: "high",
    entityType: "schedule_event",
    entityId: params.eventId,
    actionUrl: `/schedule/events/${params.eventId}`,
    recipientUserIds: params.recipientUserIds,
    channels: ["in_app", "email"],
    deduplicationKey: `schedule.event_cancelled:${params.eventId}`,
    templateVariables: {
      event_title: params.eventTitle,
      event_start: fmt(params.eventStart, params.timeZone),
      event_end: fmt(params.eventEnd, params.timeZone),
      custom_message: params.customMessage ?? "",
    },
  });
}

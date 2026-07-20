import {
  SCHEDULE_ASSIGNMENT_ROLES,
  SCHEDULE_PRIORITIES,
  SCHEDULE_SHIFT_STATUSES,
  SCHEDULE_SHIFT_TYPES,
} from "@/lib/schedule/constants";
import type {
  ScheduleActionState,
  ScheduleAssignmentRole,
  SchedulePriority,
  ScheduleShiftStatus,
  ScheduleShiftType,
} from "@/lib/schedule/types";
import { parseChurchDateTimeLocal } from "@/lib/datetime/format";

function text(formData: FormData, key: string, max: number): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

function checkbox(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type ScheduleShiftFormInput = {
  title: string;
  description: string | null;
  shift_type: ScheduleShiftType;
  status: ScheduleShiftStatus;
  event_id: string | null;
  campus_id: string | null;
  location_name: string | null;
  building: string | null;
  room: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  required_member_count: number;
  minimum_certified_member_count: number;
  required_certifications: string[];
  lead_member_required: boolean;
  priority: SchedulePriority;
  notes: string | null;
  allow_outside_event_window: boolean;
};

export function validateScheduleShiftForm(
  formData: FormData,
  churchTimeZone: string,
): ScheduleActionState & { data?: ScheduleShiftFormInput } {
  const fieldErrors: Record<string, string> = {};

  const title = text(formData, "title", 200);
  if (!title) fieldErrors.title = "Title is required.";

  const shiftTypeRaw = text(formData, "shift_type", 64) ?? "security";
  if (!SCHEDULE_SHIFT_TYPES.some((item) => item.value === shiftTypeRaw)) {
    fieldErrors.shift_type = "Select a valid shift type.";
  }

  const statusRaw = text(formData, "status", 32) ?? "open";
  if (!SCHEDULE_SHIFT_STATUSES.some((item) => item.value === statusRaw)) {
    fieldErrors.status = "Select a valid status.";
  }
  if (
    statusRaw === "cancelled" ||
    statusRaw === "completed" ||
    statusRaw === "partially_staffed" ||
    statusRaw === "fully_staffed"
  ) {
    // Staffing statuses are system-managed; allow draft/open/confirmed/in_progress
    if (
      statusRaw === "cancelled" ||
      statusRaw === "partially_staffed" ||
      statusRaw === "fully_staffed"
    ) {
      fieldErrors.status =
        "Choose Draft, Open, Confirmed, or In progress. Staffing updates automatically.";
    }
  }

  const priorityRaw = text(formData, "priority", 32) ?? "normal";
  if (!SCHEDULE_PRIORITIES.some((item) => item.value === priorityRaw)) {
    fieldErrors.priority = "Select a valid priority.";
  }

  let event_id: string | null = null;
  const eventRaw = text(formData, "event_id", 64);
  if (eventRaw) {
    if (!isValidUuid(eventRaw)) fieldErrors.event_id = "Invalid event.";
    else event_id = eventRaw;
  }

  let campus_id: string | null = null;
  const campusRaw = text(formData, "campus_id", 64);
  if (campusRaw) {
    if (!isValidUuid(campusRaw)) fieldErrors.campus_id = "Invalid campus.";
    else campus_id = campusRaw;
  }

  const timezone =
    text(formData, "timezone", 64) ?? churchTimeZone ?? "America/Los_Angeles";
  const startLocal = text(formData, "start_at", 32);
  const endLocal = text(formData, "end_at", 32);
  if (!startLocal) fieldErrors.start_at = "Start is required.";
  if (!endLocal) fieldErrors.end_at = "End is required.";

  let start_at = "";
  let end_at = "";
  if (startLocal && endLocal) {
    const startDate = parseChurchDateTimeLocal(startLocal, timezone);
    const endDate = parseChurchDateTimeLocal(endLocal, timezone);
    if (!startDate) fieldErrors.start_at = "Enter a valid start date and time.";
    if (!endDate) fieldErrors.end_at = "Enter a valid end date and time.";
    if (startDate && endDate) {
      if (startDate.getTime() >= endDate.getTime()) {
        fieldErrors.end_at = "End must be after start.";
      } else {
        start_at = startDate.toISOString();
        end_at = endDate.toISOString();
      }
    }
  }

  const requiredRaw = text(formData, "required_member_count", 8) ?? "1";
  const required_member_count = Number(requiredRaw);
  if (
    !Number.isInteger(required_member_count) ||
    required_member_count < 0 ||
    required_member_count > 500
  ) {
    fieldErrors.required_member_count = "Enter a valid required member count.";
  }

  const certifiedRaw =
    text(formData, "minimum_certified_member_count", 8) ?? "0";
  const minimum_certified_member_count = Number(certifiedRaw);
  if (
    !Number.isInteger(minimum_certified_member_count) ||
    minimum_certified_member_count < 0 ||
    minimum_certified_member_count > 500
  ) {
    fieldErrors.minimum_certified_member_count =
      "Enter a valid certified member count.";
  } else if (
    Number.isInteger(required_member_count) &&
    minimum_certified_member_count > required_member_count
  ) {
    fieldErrors.minimum_certified_member_count =
      "Certified count cannot exceed required members.";
  }

  const certsRaw = text(formData, "required_certifications", 500) ?? "";
  const required_certifications = certsRaw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  return {
    success: true,
    data: {
      title: title!,
      description: text(formData, "description", 4000),
      shift_type: shiftTypeRaw as ScheduleShiftType,
      status: statusRaw as ScheduleShiftStatus,
      event_id,
      campus_id,
      location_name: text(formData, "location_name", 200),
      building: text(formData, "building", 120),
      room: text(formData, "room", 120),
      start_at,
      end_at,
      timezone,
      required_member_count,
      minimum_certified_member_count,
      required_certifications,
      lead_member_required: checkbox(formData, "lead_member_required"),
      priority: priorityRaw as SchedulePriority,
      notes: text(formData, "notes", 4000),
      allow_outside_event_window: checkbox(
        formData,
        "allow_outside_event_window",
      ),
    },
  };
}

export type AssignMemberFormInput = {
  membership_id: string;
  assignment_role: ScheduleAssignmentRole;
  notes: string | null;
  conflict_override: boolean;
  conflict_override_reason: string | null;
};

export function validateAssignMemberForm(
  formData: FormData,
): ScheduleActionState & { data?: AssignMemberFormInput } {
  const fieldErrors: Record<string, string> = {};
  const membership_id = text(formData, "membership_id", 64);
  if (!membership_id || !isValidUuid(membership_id)) {
    fieldErrors.membership_id = "Select a team member.";
  }

  const roleRaw = text(formData, "assignment_role", 64) ?? "security_member";
  if (!SCHEDULE_ASSIGNMENT_ROLES.some((item) => item.value === roleRaw)) {
    fieldErrors.assignment_role = "Select a valid assignment role.";
  }

  const conflict_override = checkbox(formData, "conflict_override");
  const conflict_override_reason = text(
    formData,
    "conflict_override_reason",
    2000,
  );
  if (conflict_override && (!conflict_override_reason || conflict_override_reason.length < 3)) {
    fieldErrors.conflict_override_reason =
      "Provide a reason (at least 3 characters) to override conflicts.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  return {
    success: true,
    data: {
      membership_id: membership_id!,
      assignment_role: roleRaw as ScheduleAssignmentRole,
      notes: text(formData, "notes", 2000),
      conflict_override,
      conflict_override_reason,
    },
  };
}

export function validateAssignmentResponseForm(
  formData: FormData,
): ScheduleActionState & {
  data?: { decision: "accept" | "decline"; decline_note: string | null };
} {
  const fieldErrors: Record<string, string> = {};
  const decision = text(formData, "decision", 16);
  if (decision !== "accept" && decision !== "decline") {
    fieldErrors.decision = "Choose accept or decline.";
  }
  const decline_note = text(formData, "decline_note", 2000);
  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  return {
    success: true,
    data: {
      decision: decision as "accept" | "decline",
      decline_note,
    },
  };
}

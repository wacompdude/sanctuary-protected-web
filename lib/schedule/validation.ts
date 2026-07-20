import {
  SCHEDULE_EVENT_STATUSES,
  SCHEDULE_EVENT_TYPES,
  SCHEDULE_RISK_LEVELS,
} from "@/lib/schedule/constants";
import type {
  ScheduleActionState,
  ScheduleEventStatus,
  ScheduleEventType,
  ScheduleRiskLevel,
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

export type ScheduleEventFormInput = {
  title: string;
  description: string | null;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  campus_id: string | null;
  location_name: string | null;
  building: string | null;
  room: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_rule: string | null;
  recurrence_end_at: string | null;
  security_coverage_required: boolean;
  estimated_attendance: number | null;
  risk_level: ScheduleRiskLevel;
};

export function validateScheduleEventForm(
  formData: FormData,
  churchTimeZone: string,
): ScheduleActionState & { data?: ScheduleEventFormInput } {
  const fieldErrors: Record<string, string> = {};

  const title = text(formData, "title", 200);
  if (!title) fieldErrors.title = "Title is required.";

  const eventTypeRaw = text(formData, "event_type", 64) ?? "other";
  if (!SCHEDULE_EVENT_TYPES.some((item) => item.value === eventTypeRaw)) {
    fieldErrors.event_type = "Select a valid event type.";
  }

  const statusRaw = text(formData, "status", 32) ?? "scheduled";
  if (!SCHEDULE_EVENT_STATUSES.some((item) => item.value === statusRaw)) {
    fieldErrors.status = "Select a valid status.";
  }
  if (statusRaw === "cancelled" || statusRaw === "archived") {
    fieldErrors.status = "Use Cancel or Archive actions instead.";
  }

  const riskRaw = text(formData, "risk_level", 32) ?? "low";
  if (!SCHEDULE_RISK_LEVELS.some((item) => item.value === riskRaw)) {
    fieldErrors.risk_level = "Select a valid risk level.";
  }

  const campusRaw = text(formData, "campus_id", 64);
  let campus_id: string | null = null;
  if (campusRaw) {
    if (!isValidUuid(campusRaw)) {
      fieldErrors.campus_id = "Invalid campus selection.";
    } else {
      campus_id = campusRaw;
    }
  }

  const all_day = checkbox(formData, "all_day");
  const timezone =
    text(formData, "timezone", 64) ?? churchTimeZone ?? "America/Los_Angeles";

  const startLocal = text(formData, "start_at", 32);
  const endLocal = text(formData, "end_at", 32);
  if (!startLocal) fieldErrors.start_at = "Start date and time are required.";
  if (!endLocal) fieldErrors.end_at = "End date and time are required.";

  let start_at = "";
  let end_at = "";

  if (startLocal && endLocal) {
    const startDate = parseChurchDateTimeLocal(
      all_day ? `${startLocal.slice(0, 10)}T00:00` : startLocal,
      timezone,
    );
    const endDate = parseChurchDateTimeLocal(
      all_day ? `${endLocal.slice(0, 10)}T23:59` : endLocal,
      timezone,
    );
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

  const attendanceRaw = text(formData, "estimated_attendance", 16);
  let estimated_attendance: number | null = null;
  if (attendanceRaw) {
    const n = Number(attendanceRaw);
    if (!Number.isInteger(n) || n < 0 || n > 1000000) {
      fieldErrors.estimated_attendance = "Enter a valid attendance estimate.";
    } else {
      estimated_attendance = n;
    }
  }

  const recurrence_rule = text(formData, "recurrence_rule", 500);
  if (recurrence_rule) {
    const upper = recurrence_rule.toUpperCase();
    if (!upper.includes("FREQ=")) {
      fieldErrors.recurrence_rule =
        "Use an RRULE fragment such as FREQ=WEEKLY;BYDAY=SU.";
    }
    if (/FREQ=SECONDLY|FREQ=MINUTELY/i.test(recurrence_rule)) {
      fieldErrors.recurrence_rule = "That recurrence frequency is not allowed.";
    }
    if (!/COUNT=|UNTIL=/i.test(recurrence_rule)) {
      // Require an end bound when rule present — also allow recurrence_end_at
    }
  }

  let recurrence_end_at: string | null = null;
  const recurrenceEndLocal = text(formData, "recurrence_end_at", 32);
  if (recurrenceEndLocal) {
    const end = parseChurchDateTimeLocal(
      recurrenceEndLocal.length === 10
        ? `${recurrenceEndLocal}T23:59`
        : recurrenceEndLocal,
      timezone,
    );
    if (!end) {
      fieldErrors.recurrence_end_at = "Enter a valid recurrence end date.";
    } else {
      recurrence_end_at = end.toISOString();
      if (start_at && end.getTime() < new Date(start_at).getTime()) {
        fieldErrors.recurrence_end_at =
          "Recurrence end must be on or after the event start.";
      }
    }
  }

  if (recurrence_rule && !recurrence_end_at && !/COUNT=/i.test(recurrence_rule)) {
    fieldErrors.recurrence_end_at =
      "Set a recurrence end date or include COUNT= in the rule.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  return {
    success: true,
    data: {
      title: title!,
      description: text(formData, "description", 8000),
      event_type: eventTypeRaw as ScheduleEventType,
      status: statusRaw as ScheduleEventStatus,
      campus_id,
      location_name: text(formData, "location_name", 200),
      building: text(formData, "building", 120),
      room: text(formData, "room", 120),
      start_at,
      end_at,
      all_day,
      timezone,
      recurrence_rule,
      recurrence_end_at,
      security_coverage_required: checkbox(
        formData,
        "security_coverage_required",
      ),
      estimated_attendance,
      risk_level: riskRaw as ScheduleRiskLevel,
    },
  };
}

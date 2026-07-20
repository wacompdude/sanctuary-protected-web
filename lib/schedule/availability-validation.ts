import {
  SCHEDULE_UNAVAILABILITY_REASONS,
} from "@/lib/schedule/constants";
import type {
  ScheduleActionState,
  UnavailabilityReason,
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

export type UnavailabilityFormInput = {
  title: string | null;
  reason_category: UnavailabilityReason;
  notes: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_rule: string | null;
  recurrence_end_at: string | null;
  /** When managers create on behalf of another member. */
  membership_id: string | null;
};

export function validateUnavailabilityForm(
  formData: FormData,
  churchTimeZone: string,
): ScheduleActionState & { data?: UnavailabilityFormInput } {
  const fieldErrors: Record<string, string> = {};

  const reasonRaw = text(formData, "reason_category", 32) ?? "personal";
  if (!SCHEDULE_UNAVAILABILITY_REASONS.some((item) => item.value === reasonRaw)) {
    fieldErrors.reason_category = "Select a valid reason category.";
  }

  let membership_id: string | null = null;
  const membershipRaw = text(formData, "membership_id", 64);
  if (membershipRaw) {
    if (!isValidUuid(membershipRaw)) {
      fieldErrors.membership_id = "Invalid member selection.";
    } else {
      membership_id = membershipRaw;
    }
  }

  const all_day = checkbox(formData, "all_day");
  const timezone =
    text(formData, "timezone", 64) ?? churchTimeZone ?? "America/Los_Angeles";

  const startLocal = text(formData, "start_at", 32);
  const endLocal = text(formData, "end_at", 32);
  if (!startLocal) fieldErrors.start_at = "Start is required.";
  if (!endLocal) fieldErrors.end_at = "End is required.";

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
    if (!startDate) fieldErrors.start_at = "Enter a valid start.";
    if (!endDate) fieldErrors.end_at = "Enter a valid end.";
    if (startDate && endDate) {
      if (startDate.getTime() >= endDate.getTime()) {
        fieldErrors.end_at = "End must be after start.";
      } else {
        start_at = startDate.toISOString();
        end_at = endDate.toISOString();
      }
    }
  }

  const recurrence_rule = text(formData, "recurrence_rule", 500);
  if (recurrence_rule) {
    if (!/FREQ=/i.test(recurrence_rule)) {
      fieldErrors.recurrence_rule =
        "Use an RRULE fragment such as FREQ=WEEKLY;BYDAY=TU.";
    }
    if (/FREQ=SECONDLY|FREQ=MINUTELY/i.test(recurrence_rule)) {
      fieldErrors.recurrence_rule = "That recurrence frequency is not allowed.";
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
          "Recurrence end must be on or after the start.";
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
      title: text(formData, "title", 200),
      reason_category: reasonRaw as UnavailabilityReason,
      notes: text(formData, "notes", 2000),
      start_at,
      end_at,
      all_day,
      timezone,
      recurrence_rule,
      recurrence_end_at,
      membership_id,
    },
  };
}

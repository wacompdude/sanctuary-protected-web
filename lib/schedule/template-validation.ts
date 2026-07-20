import {
  SCHEDULE_EVENT_TYPES,
  SCHEDULE_SHIFT_TYPES,
} from "@/lib/schedule/constants";
import type {
  ScheduleActionState,
  ScheduleEventType,
  ScheduleShiftType,
  ScheduleTemplateShiftDefinition,
} from "@/lib/schedule/types";

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

export function parseShiftDefinitionsJson(
  raw: string,
): { defs?: ScheduleTemplateShiftDefinition[]; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { defs: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "Shift definitions must be valid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { error: "Shift definitions must be a JSON array." };
  }
  if (parsed.length > 30) {
    return { error: "Limit templates to 30 shift definitions." };
  }

  const defs: ScheduleTemplateShiftDefinition[] = [];
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== "object") {
      return { error: `Shift definition ${index + 1} is invalid.` };
    }
    const row = item as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    if (!title || title.length > 200) {
      return { error: `Shift definition ${index + 1} needs a title.` };
    }
    const shiftType = String(row.shift_type ?? "security").trim();
    if (!SCHEDULE_SHIFT_TYPES.some((s) => s.value === shiftType)) {
      return { error: `Shift definition ${index + 1} has an invalid type.` };
    }
    const offset = Number(row.offset_minutes ?? 0);
    const duration = Number(row.duration_minutes ?? 180);
    const required = Number(row.required_member_count ?? 1);
    if (!Number.isFinite(offset) || !Number.isInteger(offset)) {
      return { error: `Shift definition ${index + 1}: invalid offset.` };
    }
    if (
      !Number.isFinite(duration) ||
      !Number.isInteger(duration) ||
      duration < 15 ||
      duration > 10080
    ) {
      return { error: `Shift definition ${index + 1}: invalid duration.` };
    }
    if (
      !Number.isFinite(required) ||
      !Number.isInteger(required) ||
      required < 1 ||
      required > 200
    ) {
      return {
        error: `Shift definition ${index + 1}: invalid required member count.`,
      };
    }
    defs.push({
      title,
      shift_type: shiftType as ScheduleShiftType,
      offset_minutes: offset,
      duration_minutes: duration,
      required_member_count: required,
      location_name:
        typeof row.location_name === "string"
          ? row.location_name.slice(0, 200) || null
          : null,
      notes:
        typeof row.notes === "string" ? row.notes.slice(0, 2000) || null : null,
    });
  }
  return { defs };
}

export type ScheduleTemplateFormInput = {
  name: string;
  description: string | null;
  event_type: ScheduleEventType;
  campus_id: string | null;
  default_duration_minutes: number;
  default_location: string | null;
  default_shift_definitions: ScheduleTemplateShiftDefinition[];
  is_active: boolean;
};

export function validateScheduleTemplateForm(
  formData: FormData,
): ScheduleActionState & { data?: ScheduleTemplateFormInput } {
  const fieldErrors: Record<string, string> = {};

  const name = text(formData, "name", 200);
  if (!name) fieldErrors.name = "Name is required.";

  const description = text(formData, "description", 4000);

  const eventTypeRaw = text(formData, "event_type", 64) ?? "worship_service";
  if (!SCHEDULE_EVENT_TYPES.some((item) => item.value === eventTypeRaw)) {
    fieldErrors.event_type = "Select a valid event type.";
  }

  const campusRaw = text(formData, "campus_id", 64);
  let campus_id: string | null = null;
  if (campusRaw) {
    if (!isValidUuid(campusRaw)) {
      fieldErrors.campus_id = "Select a valid campus.";
    } else {
      campus_id = campusRaw;
    }
  }

  const durationRaw = String(
    formData.get("default_duration_minutes") ?? "120",
  ).trim();
  const default_duration_minutes = Number(durationRaw);
  if (
    !Number.isFinite(default_duration_minutes) ||
    !Number.isInteger(default_duration_minutes) ||
    default_duration_minutes < 15 ||
    default_duration_minutes > 10080
  ) {
    fieldErrors.default_duration_minutes =
      "Duration must be between 15 and 10080 minutes.";
  }

  const default_location = text(formData, "default_location", 200);
  const defsRaw = String(formData.get("default_shift_definitions") ?? "[]");
  const parsed = parseShiftDefinitionsJson(defsRaw);
  if (parsed.error) {
    fieldErrors.default_shift_definitions = parsed.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  return {
    data: {
      name: name!,
      description,
      event_type: eventTypeRaw as ScheduleEventType,
      campus_id,
      default_duration_minutes,
      default_location,
      default_shift_definitions: parsed.defs ?? [],
      is_active: checkbox(formData, "is_active"),
    },
  };
}

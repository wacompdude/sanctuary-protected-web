import type { ChurchAppPreferences } from "@/lib/church/settings";
import { DEFAULT_APP_PREFERENCES } from "@/lib/church/settings";
import {
  formatChurchDateTime,
  resolveChurchTimeZone,
} from "@/lib/datetime/format";

export function formatDateTime(
  iso: string,
  preferences?: Partial<ChurchAppPreferences> | null,
  timeZone?: string | null,
) {
  return formatChurchDateTime(iso, {
    timeZone: resolveChurchTimeZone(timeZone),
    dateFormat: preferences?.date_format ?? DEFAULT_APP_PREFERENCES.date_format,
    timeFormat: preferences?.time_format ?? DEFAULT_APP_PREFERENCES.time_format,
  });
}

/**
 * Value for `<input type="datetime-local">` in the church timezone.
 * Falls back to browser-local conversion when Intl parts are unavailable.
 */
export function formatDateTimeLocalValue(
  date = new Date(),
  timeZone?: string | null,
) {
  const resolved = resolveChurchTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: resolved,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  }
}

export function formatIncidentId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function labelForEnum(
  options: { value: string; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export type IncidentListSort =
  | "occurred_at_desc"
  | "occurred_at_asc"
  | "severity_desc"
  | "status";

export function resolveIncidentListSort(
  preferences?: Partial<ChurchAppPreferences> | null,
): IncidentListSort {
  const sort =
    preferences?.default_incident_sort ??
    DEFAULT_APP_PREFERENCES.default_incident_sort;
  if (
    sort === "occurred_at_desc" ||
    sort === "occurred_at_asc" ||
    sort === "severity_desc" ||
    sort === "status"
  ) {
    return sort;
  }
  return "occurred_at_desc";
}

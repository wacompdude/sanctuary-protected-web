import type { ChurchAppPreferences } from "@/lib/church/settings";
import { DEFAULT_APP_PREFERENCES } from "@/lib/church/settings";

export function formatDateTime(
  iso: string,
  preferences?: Partial<ChurchAppPreferences> | null,
) {
  const dateFormat =
    preferences?.date_format ?? DEFAULT_APP_PREFERENCES.date_format;
  const timeFormat =
    preferences?.time_format ?? DEFAULT_APP_PREFERENCES.time_format;
  const date = new Date(iso);

  const dateOpts: Intl.DateTimeFormatOptions =
    dateFormat === "YYYY-MM-DD"
      ? { year: "numeric", month: "2-digit", day: "2-digit" }
      : dateFormat === "DD/MM/YYYY"
        ? { day: "2-digit", month: "2-digit", year: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" };

  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat !== "24h",
  };

  return `${date.toLocaleDateString("en-US", dateOpts)} ${date.toLocaleTimeString("en-US", timeOpts)}`;
}

export function formatDateTimeLocalValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
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

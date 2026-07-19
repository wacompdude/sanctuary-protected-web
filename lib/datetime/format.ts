import type { ChurchAppPreferences } from "@/lib/church/settings";
import { DEFAULT_APP_PREFERENCES } from "@/lib/church/settings";

export const DEFAULT_CHURCH_TIMEZONE = "America/Los_Angeles";

export type ChurchDateTimeOptions = {
  timeZone?: string | null;
  dateFormat?: ChurchAppPreferences["date_format"] | null;
  timeFormat?: ChurchAppPreferences["time_format"] | null;
};

export function resolveChurchTimeZone(timeZone?: string | null): string {
  const value = timeZone?.trim();
  if (!value) return DEFAULT_CHURCH_TIMEZONE;
  try {
    // Throws RangeError for invalid IANA zones in modern runtimes.
    Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return DEFAULT_CHURCH_TIMEZONE;
  }
}

function dateOptions(
  dateFormat: ChurchAppPreferences["date_format"],
): Intl.DateTimeFormatOptions {
  if (dateFormat === "YYYY-MM-DD") {
    return { year: "numeric", month: "2-digit", day: "2-digit" };
  }
  if (dateFormat === "DD/MM/YYYY") {
    return { day: "2-digit", month: "2-digit", year: "numeric" };
  }
  return { month: "short", day: "numeric", year: "numeric" };
}

function timeOptions(
  timeFormat: ChurchAppPreferences["time_format"],
): Intl.DateTimeFormatOptions {
  return {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat !== "24h",
  };
}

export function formatChurchDateTime(
  value: string | Date | null | undefined,
  options?: ChurchDateTimeOptions | null,
): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const timeZone = resolveChurchTimeZone(options?.timeZone);
  const dateFormat =
    options?.dateFormat ?? DEFAULT_APP_PREFERENCES.date_format;
  const timeFormat =
    options?.timeFormat ?? DEFAULT_APP_PREFERENCES.time_format;

  const formattedDate = date.toLocaleDateString("en-US", {
    ...dateOptions(dateFormat),
    timeZone,
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    ...timeOptions(timeFormat),
    timeZone,
  });
  return `${formattedDate} ${formattedTime}`;
}

export function formatChurchDate(
  value: string | Date | null | undefined,
  options?: ChurchDateTimeOptions | null,
): string {
  if (value == null || value === "") return "—";

  // Date-only values (YYYY-MM-DD) should not shift via UTC midnight.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const timeZone = resolveChurchTimeZone(options?.timeZone);
    const dateFormat =
      options?.dateFormat ?? DEFAULT_APP_PREFERENCES.date_format;
    const noonUtc = new Date(`${value}T12:00:00.000Z`);
    return noonUtc.toLocaleDateString("en-US", {
      ...dateOptions(dateFormat),
      timeZone,
    });
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const timeZone = resolveChurchTimeZone(options?.timeZone);
  const dateFormat =
    options?.dateFormat ?? DEFAULT_APP_PREFERENCES.date_format;
  return date.toLocaleDateString("en-US", {
    ...dateOptions(dateFormat),
    timeZone,
  });
}

/** Clock parts in a church timezone (for quiet-hours / scheduling). */
export function getChurchClockParts(
  date: Date,
  timeZone?: string | null,
): { hour: number; minute: number } {
  const resolved = resolveChurchTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolved,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return { hour, minute };
}

/**
 * Parse a `<input type="datetime-local">` value as wall time in the church
 * timezone and return the corresponding UTC Date.
 */
export function parseChurchDateTimeLocal(
  localValue: string,
  timeZone?: string | null,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    localValue.trim(),
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) {
    return null;
  }

  const resolved = resolveChurchTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolved,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const readParts = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: get("hour"),
      minute: get("minute"),
      second: get("second"),
    };
  };

  // Iteratively correct UTC guess so church-local wall time matches input.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const shown = readParts(new Date(utcMs));
    const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const shownMs = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    utcMs += desiredMs - shownMs;
  }

  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result;
}

import { resolveChurchTimeZone } from "@/lib/datetime/format";

/** Format an ISO timestamp for datetime-local / date input in a church timezone. */
export function toChurchDateTimeLocalValue(
  iso: string | null | undefined,
  timeZone: string,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveChurchTimeZone(timeZone),
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
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Parse a datetime-local / date value as a local wall-clock Date. */
function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T00:00:00` : `${value}:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Keep end on the same calendar day as start (preserve end time when possible).
 * Used when the user changes the start date on create/edit forms.
 */
export function syncEndLocalWithStartDate(input: {
  startLocal: string;
  endLocal: string;
  previousStartLocal?: string;
  allDay: boolean;
  defaultDurationMinutes?: number;
}): string {
  const { startLocal, endLocal, previousStartLocal, allDay } = input;
  const defaultMinutes = input.defaultDurationMinutes ?? 120;
  if (!startLocal) return endLocal;

  if (allDay || startLocal.length === 10) {
    return startLocal.slice(0, 10);
  }

  const startDate = startLocal.slice(0, 10);
  if (!endLocal) {
    const startDateObj = parseDateTimeLocal(startLocal);
    if (!startDateObj) return endLocal;
    startDateObj.setMinutes(startDateObj.getMinutes() + defaultMinutes);
    return formatDateTimeLocal(startDateObj);
  }

  const endTime = endLocal.includes("T")
    ? endLocal.slice(11, 16)
    : "12:00";
  const nextEnd = `${startDate}T${endTime}`;
  if (nextEnd > startLocal) return nextEnd;

  const prevStart = previousStartLocal
    ? parseDateTimeLocal(previousStartLocal)
    : null;
  const prevEnd = parseDateTimeLocal(endLocal);
  const nextStart = parseDateTimeLocal(startLocal);
  if (!nextStart) return nextEnd;

  if (prevStart && prevEnd) {
    const durationMs = prevEnd.getTime() - prevStart.getTime();
    if (durationMs > 0) {
      return formatDateTimeLocal(new Date(nextStart.getTime() + durationMs));
    }
  }

  nextStart.setMinutes(nextStart.getMinutes() + defaultMinutes);
  return formatDateTimeLocal(nextStart);
}

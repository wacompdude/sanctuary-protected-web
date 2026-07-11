import {
  EXPIRING_SOON_DAYS,
  type CertificationComputedStatus,
} from "./types";

export function getCertificationStatus(
  expirationDate: string,
  now = new Date(),
): CertificationComputedStatus {
  const expires = parseDateOnly(expirationDate);
  const today = startOfDay(now);
  const soonCutoff = new Date(today);
  soonCutoff.setDate(soonCutoff.getDate() + EXPIRING_SOON_DAYS);

  if (expires < today) return "expired";
  if (expires <= soonCutoff) return "expiring_soon";
  return "active";
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC shift). */
function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }
  return startOfDay(new Date(value));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const certificationStatusLabel: Record<
  CertificationComputedStatus,
  string
> = {
  active: "Active",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
};

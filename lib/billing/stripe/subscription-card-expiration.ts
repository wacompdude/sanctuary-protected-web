/**
 * Base-subscription card expiration rules.
 * One current threshold is selected. Earlier thresholds are not backfilled.
 *
 * Days remaining are whole UTC calendar days until the last day of the
 * expiration month, inclusive. That last day is still valid (0 days → 7-day
 * warning). The following UTC day is expired.
 *
 * 61+ days: no warning
 * 60–31 days: 60-day warning
 * 30–8 days: 30-day warning
 * 7–0 days: 7-day warning
 * before the expiration month ends: not expired
 */

export const SUBSCRIPTION_CARD_EXPIRATION_ROLES = ["owner", "co_owner"] as const;

export const SUBSCRIPTION_CARD_EXPIRATION_CHANNELS = ["in_app", "email"] as const;

/** Stripe-backed subscriptions that can still be billed. Incomplete and cancelled are excluded. */
export const SUBSCRIPTION_CARD_EXPIRATION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "grace_period",
] as const;

export const SUBSCRIPTION_CARD_EXPIRATION_PAGE_SIZE = 25;

export type SubscriptionCardExpirationThreshold = "60_day" | "30_day" | "7_day" | "expired";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function isSubscriptionCardExpirationRecipient(role: string | null): boolean {
  return (
    role != null &&
    (SUBSCRIPTION_CARD_EXPIRATION_ROLES as readonly string[]).includes(role)
  );
}

export function cardExpirationLastUtcDay(
  expMonth: number,
  expYear: number,
): { year: number; month: number; day: number } | null {
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) return null;
  if (!Number.isInteger(expYear) || expYear < 2000 || expYear > 2100) return null;
  const last = new Date(Date.UTC(expYear, expMonth, 0));
  return {
    year: last.getUTCFullYear(),
    month: last.getUTCMonth() + 1,
    day: last.getUTCDate(),
  };
}

function utcDayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Whole UTC days from today through the last day of the expiration month. */
export function daysUntilCardExpiration(
  expMonth: number,
  expYear: number,
  now: Date,
): number | null {
  const end = cardExpirationLastUtcDay(expMonth, expYear);
  if (!end || Number.isNaN(now.getTime())) return null;
  const today = utcDayNumber(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
  return utcDayNumber(end.year, end.month, end.day) - today;
}

export function classifySubscriptionCardExpiration(
  daysRemaining: number,
): SubscriptionCardExpirationThreshold | null {
  if (!Number.isInteger(daysRemaining)) return null;
  if (daysRemaining > 60) return null;
  if (daysRemaining >= 31) return "60_day";
  if (daysRemaining >= 8) return "30_day";
  if (daysRemaining >= 0) return "7_day";
  return "expired";
}

export function subscriptionCardExpirationDecision(input: {
  paymentMethodType: string;
  expMonth: number | null;
  expYear: number | null;
  now: Date;
}): {
  threshold: SubscriptionCardExpirationThreshold;
  daysRemaining: number;
  expMonth: number;
  expYear: number;
} | null {
  if (input.paymentMethodType !== "card") return null;
  if (input.expMonth == null || input.expYear == null) return null;
  const daysRemaining = daysUntilCardExpiration(input.expMonth, input.expYear, input.now);
  if (daysRemaining == null) return null;
  const threshold = classifySubscriptionCardExpiration(daysRemaining);
  if (!threshold) return null;
  return {
    threshold,
    daysRemaining,
    expMonth: input.expMonth,
    expYear: input.expYear,
  };
}

export function subscriptionCardExpirationDedupKey(input: {
  paymentMethodId: string;
  expMonth: number;
  expYear: number;
  threshold: SubscriptionCardExpirationThreshold;
}): string {
  const month = String(input.expMonth).padStart(2, "0");
  return `billing.subscription_card:${input.paymentMethodId}:${input.expYear}-${month}:${input.threshold}`;
}

function brandLabel(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) return "Card";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function subscriptionCardExpirationNotice(input: {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  threshold: SubscriptionCardExpirationThreshold;
  organizationName: string;
}): {
  notificationType: "billing.payment_method_expiring" | "billing.payment_method_expired";
  severity: "medium" | "high";
  title: string;
  body: string;
} {
  const monthName = MONTH_NAMES[input.expMonth - 1] ?? "the expiration month";
  const card = `${brandLabel(input.brand)} ending in ${input.last4}`;
  const organization = input.organizationName.trim() || "your organization";
  if (input.threshold === "expired") {
    return {
      notificationType: "billing.payment_method_expired",
      severity: "high",
      title: "Subscription payment method expired",
      body: `Your ${card} expired in ${monthName} ${input.expYear}. Update your subscription payment method to help prevent interruption to your Sanctuary Protected subscription for ${organization}.`,
    };
  }
  return {
    notificationType: "billing.payment_method_expiring",
    severity: "medium",
    title: "Subscription payment method expires soon",
    body: `Your ${card} expires in ${monthName} ${input.expYear}. Update your subscription payment method before it expires to avoid interruption to your Sanctuary Protected subscription for ${organization}.`,
  };
}

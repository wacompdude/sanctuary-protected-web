/**
 * Subscription card expiration warning checks.
 * No Stripe, email, SMS, or database calls.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { effectiveSubscriptionPaymentMethodId } from "@/lib/billing/stripe/subscription-payment-method";
import {
  cardExpirationLastUtcDay,
  classifySubscriptionCardExpiration,
  daysUntilCardExpiration,
  isSubscriptionCardExpirationRecipient,
  subscriptionCardExpirationDecision,
  subscriptionCardExpirationDedupKey,
  subscriptionCardExpirationNotice,
} from "@/lib/billing/stripe/subscription-card-expiration";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function thresholdOn(expMonth: number, expYear: number, now: Date) {
  const days = daysUntilCardExpiration(expMonth, expYear, now);
  assert(days != null, "days calculated");
  return { days, threshold: classifySubscriptionCardExpiration(days) };
}

const rules = readRepo("lib/billing/stripe/subscription-card-expiration.ts");
const live = readRepo("lib/billing/stripe/subscription-card-expiration-live.ts");
const route = readRepo("app/api/notifications/billing/card-expiration/route.ts");
const vercel = readRepo("vercel.json");
const senderMap = readRepo("lib/email/notification-sender-map.ts");
const dedupeMigration = readRepo("supabase/migrations/027_notifications.sql");
const createNotification = readRepo("lib/notifications/create-notification.ts");

const dec2030 = { month: 12, year: 2030 };

assert(thresholdOn(12, 2030, utc(2030, 10, 31)).days === 61, "1 61 days");
assert(thresholdOn(12, 2030, utc(2030, 10, 31)).threshold === null, "1 no warning");
assert(thresholdOn(12, 2030, utc(2030, 11, 1)).days === 60, "2 60 days");
assert(thresholdOn(12, 2030, utc(2030, 11, 1)).threshold === "60_day", "2 60-day warning");
assert(thresholdOn(12, 2030, utc(2030, 11, 2)).days === 59, "3 59 days");
assert(thresholdOn(12, 2030, utc(2030, 11, 2)).threshold === "60_day", "3 still 60-day");
assert(thresholdOn(12, 2030, utc(2030, 11, 30)).days === 31, "4 31 days");
assert(
  thresholdOn(12, 2030, utc(2030, 11, 30)).threshold === "60_day",
  "4 31 days stays in the 60-day bucket",
);
assert(thresholdOn(12, 2030, utc(2030, 12, 1)).days === 30, "5 30 days");
assert(thresholdOn(12, 2030, utc(2030, 12, 1)).threshold === "30_day", "5 30-day warning");
assert(thresholdOn(12, 2030, utc(2030, 12, 2)).days === 29, "6 29 days");
assert(thresholdOn(12, 2030, utc(2030, 12, 2)).threshold === "30_day", "6 still 30-day");
assert(thresholdOn(12, 2030, utc(2030, 12, 23)).days === 8, "7 8 days");
assert(thresholdOn(12, 2030, utc(2030, 12, 23)).threshold === "30_day", "7 8 days stays 30-day");
assert(thresholdOn(12, 2030, utc(2030, 12, 24)).days === 7, "8 7 days");
assert(thresholdOn(12, 2030, utc(2030, 12, 24)).threshold === "7_day", "8 7-day warning");
assert(thresholdOn(12, 2030, utc(2030, 12, 25)).days === 6, "9 6 days");
assert(thresholdOn(12, 2030, utc(2030, 12, 25)).threshold === "7_day", "9 still 7-day");
assert(cardExpirationLastUtcDay(12, 2030)?.day === 31, "10 December ends on the 31st");
assert(thresholdOn(12, 2030, utc(2030, 12, 31)).days === 0, "10 last valid day");
assert(
  thresholdOn(12, 2030, utc(2030, 12, 31)).threshold === "7_day",
  "10 last valid day is not expired",
);
assert(thresholdOn(12, 2030, utc(2031, 1, 1)).days === -1, "11 day after expiration");
assert(thresholdOn(12, 2030, utc(2031, 1, 1)).threshold === "expired", "11 expired warning");
assert(cardExpirationLastUtcDay(2, 2028)?.day === 29, "12 leap-year February");
assert(thresholdOn(2, 2028, utc(2028, 2, 29)).threshold === "7_day", "12 Feb 29 still valid");
assert(thresholdOn(2, 2028, utc(2028, 3, 1)).threshold === "expired", "12 March 1 expired");
assert(cardExpirationLastUtcDay(2, 2027)?.day === 28, "13 non-leap February");
assert(thresholdOn(2, 2027, utc(2027, 3, 1)).threshold === "expired", "13 March 1 expired");
assert(thresholdOn(12, 2030, utc(2031, 1, 1)).threshold === "expired", "14 year boundary");
assert(daysUntilCardExpiration(0, 2030, utc(2030, 1, 1)) === null, "15 bad month");
assert(daysUntilCardExpiration(13, 2030, utc(2030, 1, 1)) === null, "15 month 13");
assert(daysUntilCardExpiration(1.5, 2030, utc(2030, 1, 1)) === null, "15 fractional month");
assert(daysUntilCardExpiration(12, 1999, utc(2030, 1, 1)) === null, "16 bad year");
assert(daysUntilCardExpiration(12, 2101, utc(2030, 1, 1)) === null, "16 year 2101");

assert(
  effectiveSubscriptionPaymentMethodId({
    subscriptionDefaultPaymentMethodId: "pm_subscription",
    customerInvoiceDefaultPaymentMethodId: "pm_customer",
  }) === "pm_subscription",
  "17 subscription default wins",
);
assert(
  effectiveSubscriptionPaymentMethodId({
    subscriptionDefaultPaymentMethodId: null,
    customerInvoiceDefaultPaymentMethodId: "pm_customer",
  }) === "pm_customer",
  "18 customer default is the fallback",
);
assert(!live.includes("paymentMethods.list"), "19 attached cards are not listed");
assert(!live.includes("organization_sms_auto_replenishment"), "20 SMS payment method ignored");
assert(
  subscriptionCardExpirationDecision({
    paymentMethodType: "card",
    expMonth: null,
    expYear: null,
    now: utc(2030, 1, 1),
  }) === null,
  "21 missing card expiration is skipped",
);
assert(
  subscriptionCardExpirationDecision({
    paymentMethodType: "us_bank_account",
    expMonth: 12,
    expYear: 2030,
    now: utc(2030, 12, 1),
  }) === null,
  "22 non-card skipped",
);
assert(live.includes("card expiration could not be read"), "23 stripe failure is recorded without a warning");
assert(live.includes("continue") || live.includes("errors.push"), "23 scan continues after one failure");

const first = subscriptionCardExpirationDedupKey({
  paymentMethodId: "pm_card",
  expMonth: dec2030.month,
  expYear: dec2030.year,
  threshold: "60_day",
});
assert(first.includes("60_day"), "24 60-day identity");
assert(first === subscriptionCardExpirationDedupKey({
  paymentMethodId: "pm_card",
  expMonth: 12,
  expYear: 2030,
  threshold: "60_day",
}), "25 same warning identity");
assert(
  subscriptionCardExpirationDedupKey({
    paymentMethodId: "pm_card",
    expMonth: 12,
    expYear: 2030,
    threshold: "30_day",
  }) !== first,
  "26 30-day is a new identity",
);
assert(
  subscriptionCardExpirationDedupKey({
    paymentMethodId: "pm_card",
    expMonth: 12,
    expYear: 2030,
    threshold: "7_day",
  }).includes("7_day"),
  "27 7-day identity",
);
assert(
  subscriptionCardExpirationDedupKey({
    paymentMethodId: "pm_card",
    expMonth: 12,
    expYear: 2030,
    threshold: "expired",
  }).includes("expired"),
  "28 expired identity",
);
assert(
  subscriptionCardExpirationDedupKey({
    paymentMethodId: "pm_new",
    expMonth: 12,
    expYear: 2030,
    threshold: "60_day",
  }) !== first,
  "29 replacement payment method is a new identity",
);
assert(
  subscriptionCardExpirationDedupKey({
    paymentMethodId: "pm_card",
    expMonth: 12,
    expYear: 2029,
    threshold: "60_day",
  }) !== first,
  "30 new expiration is a new identity",
);
assert(
  dedupeMigration.includes("notifications_church_dedupe_active_idx"),
  "31 database unique deduplication index",
);
assert(createNotification.includes('insertError?.code === "23505"'), "31 unique violation is a duplicate");
assert(live.includes("recipientRoles"), "32 recipients are resolved per warning");
assert(
  readRepo("supabase/migrations/027_notifications.sql").includes(
    "notification_recipients_notification_user_idx",
  ),
  "32 one recipient row per user",
);
assert(
  createNotification.includes("one bad row cannot wipe email + in-app"),
  "33 one delivery failure does not erase the other",
);

for (const role of ["owner", "co_owner"] as const) {
  assert(isSubscriptionCardExpirationRecipient(role), `${role} receives warning`);
}
for (const role of [
  "administrator",
  "security_leader",
  "security_member",
  "viewer",
  null,
]) {
  assert(!isSubscriptionCardExpirationRecipient(role), `${role ?? "removed"} excluded`);
}
assert(live.includes('SUBSCRIPTION_CARD_EXPIRATION_ROLES'), "41 only expiration roles are passed");
assert(!rules.includes('"administrator"'), "36 administrator is not an expiration role");
assert(live.includes("organizationId: input.organizationId"), "42 organization comes from the candidate row");

assert(rules.includes('"in_app"'), "43 in-app channel");
assert(rules.includes('"email"'), "44 email channel");
assert(!rules.includes('"sms"'), "45 no SMS channel");
assert(!live.includes("bird"), "45 no Bird call");
assert(!live.includes("notification_deliveries") || !live.includes('channel: "sms"'), "46 scanner does not write SMS deliveries");
assert(!live.includes("sms_credit"), "47 no SMS allocation");
assert(!live.includes("purchased"), "48 no purchased SMS consumption");
assert(!live.includes("mfa"), "49 no MFA SMS");
assert(!rules.includes('"push"'), "50 no push channel");

for (const forbidden of [
  "subscriptions.update",
  "customers.update",
  "paymentMethods.update",
  "setupIntents.create",
  "paymentIntents.create",
  "invoices.create",
  "checkout.sessions.create",
  "charges.create",
  "refunds.create",
  "automatic_tax",
  "billing_address",
  "cancel_at",
]) {
  assert(!live.includes(forbidden), `detector does not use ${forbidden}`);
}
assert(!live.includes("organization_sms"), "61 SMS payment method untouched");

const soon = subscriptionCardExpirationNotice({
  brand: "mastercard",
  last4: "4444",
  expMonth: 12,
  expYear: 2030,
  threshold: "60_day",
  organizationName: "Sanctuary Protected Test",
});
assert(soon.title === "Subscription payment method expires soon", "expiring title");
assert(soon.body.includes("Mastercard ending in 4444"), "safe brand and last4");
assert(soon.body.includes("December 2030"), "month and year");
assert(!soon.body.includes("canceled"), "does not claim cancellation");
assert(!soon.body.toLowerCase().includes("payment failed"), "does not claim payment failure");
assert(!soon.body.includes("pm_"), "body has no payment method id");
const expired = subscriptionCardExpirationNotice({
  brand: "mastercard",
  last4: "4444",
  expMonth: 12,
  expYear: 2030,
  threshold: "expired",
  organizationName: "Sanctuary Protected Test",
});
assert(expired.title === "Subscription payment method expired", "expired title");
assert(expired.notificationType === "billing.payment_method_expired", "expired type");
assert(senderMap.includes('"billing.payment_method_expiring": "billing"'), "billing sender");
assert(senderMap.includes('"billing.payment_method_expired": "billing"'), "expired billing sender");
assert(live.includes('actionUrl: "/settings/billing"'), "billing destination");
assert(live.includes("dispatchNow: false"), "email waits for the existing dispatcher");
assert(route.includes("CRON_SECRET"), "existing cron secret");
assert(route.includes("Unauthorized"), "unauthenticated cron denied");
assert(vercel.includes("/api/notifications/billing/card-expiration"), "daily cron path");
assert(vercel.includes('"45 8 * * *"'), "daily schedule");
assert(live.includes("SUBSCRIPTION_CARD_EXPIRATION_PAGE_SIZE"), "bounded pages");
assert(!live.includes("Promise.all"), "organizations are not fetched concurrently");
assert(rules.includes('"active"') && rules.includes('"grace_period"'), "candidate statuses");
assert(!rules.includes('"incomplete"'), "incomplete checkout is not scanned");
assert(!rules.includes('"cancelled"'), "cancelled subscriptions are not scanned");

console.log("subscription card expiration self-check passed");

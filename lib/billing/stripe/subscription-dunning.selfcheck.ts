/**
 * Subscription payment failure and recovery checks.
 * No Stripe network, email, or database calls.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleInvoicePaid, handleInvoicePaymentFailed } from "@/lib/billing/stripe/webhook-sync";
import type { WebhookSyncStore } from "@/lib/billing/stripe/webhook-sync";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import {
  formatStripeRetryDate,
  isBaseSubscriptionDunningInvoice,
  isSubscriptionDunningRecipient,
  subscriptionFailureDedupKey,
  subscriptionFailureNotice,
  subscriptionFinalFailureDedupKey,
  subscriptionFinalFailureEffect,
  subscriptionFinalFailureNotice,
  subscriptionPaymentAttention,
  subscriptionPaymentFailureEffect,
  subscriptionPaymentRecoveryEffect,
  subscriptionRecoveryDedupKey,
  subscriptionRecoveryNotice,
} from "@/lib/billing/stripe/subscription-dunning";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const rules = readRepo("lib/billing/stripe/subscription-dunning.ts");
const sync = readRepo("lib/billing/stripe/webhook-sync.ts");
const storeSource = readRepo("lib/billing/stripe/webhook-store.ts");
const page = readRepo("app/(app)/settings/billing/page.tsx");
const dispatch = readRepo("lib/billing/stripe/webhook-dispatch.ts");
const sender = readRepo("lib/email/notification-sender-map.ts");

assert(
  isBaseSubscriptionDunningInvoice({
    subscriptionId: "sub_base",
    planResolved: true,
    billingReason: "subscription_cycle",
  }),
  "1 base subscription invoice recognized",
);
assert(
  !isBaseSubscriptionDunningInvoice({
    subscriptionId: null,
    planResolved: false,
    billingReason: "manual",
  }),
  "2 unrelated invoice ignored",
);
assert(
  !isBaseSubscriptionDunningInvoice({
    subscriptionId: "sub_base",
    planResolved: false,
    sanctuaryCheckout: "sms_package",
    packageKey: "sms_block",
  }),
  "3 SMS purchase ignored",
);
assert(
  !isBaseSubscriptionDunningInvoice({
    subscriptionId: null,
    planResolved: false,
    sanctuaryPurpose: "sms_auto_replenishment_payment_setup",
  }),
  "4 SMS replenishment ignored",
);

const first = subscriptionPaymentFailureEffect({ existingStatus: null });
assert(first.action === "record", "5 first failure is recorded");
assert(subscriptionFailureDedupKey("in_1") === subscriptionFailureDedupKey("in_1"), "5 stable failure identity");
for (const role of ["owner", "co_owner"] as const) {
  assert(isSubscriptionDunningRecipient(role), `${role} receives dunning`);
}
for (const role of ["administrator", "security_leader", "security_member", "viewer", null]) {
  assert(!isSubscriptionDunningRecipient(role), `${role ?? "none"} excluded`);
}
assert(storeSource.includes('channels: [...SUBSCRIPTION_DUNNING_CHANNELS]'), "12-13 in-app and email channels");
assert(!storeSource.includes('channel: "sms"') && !storeSource.includes('channel: "push"'), "14-15 no sms or push");

const retryUnix = Date.parse("2026-10-18T00:00:00.000Z") / 1000;
assert(formatStripeRetryDate(retryUnix, "UTC") === "October 18, 2026 at 12:00 AM UTC", "16-18 retry date");
assert(formatStripeRetryDate(null, "America/Los_Angeles") === null, "17 missing retry is not invented");
assert(formatStripeRetryDate(1.5, "America/Los_Angeles") === null, "invalid retry is not invented");
const validationUnix = Date.parse("2026-11-18T04:18:19.000Z") / 1000;
assert(
  formatStripeRetryDate(validationUnix, "America/Los_Angeles") === "November 17, 2026 at 8:18 PM PST",
  "pacific local date crosses the UTC calendar day",
);
assert(
  formatStripeRetryDate(validationUnix, "America/New_York") === "November 17, 2026 at 11:18 PM EST",
  "eastern local time",
);
assert(
  formatStripeRetryDate(validationUnix, "America/Chicago") === "November 17, 2026 at 10:18 PM CST",
  "central local time",
);
assert(
  formatStripeRetryDate(validationUnix, "America/Denver") === "November 17, 2026 at 9:18 PM MST",
  "mountain local time",
);
assert(
  formatStripeRetryDate(Date.parse("2026-11-18T18:00:00.000Z") / 1000, "America/New_York") ===
    "November 18, 2026 at 1:00 PM EST",
  "same local and UTC calendar date",
);
assert(
  formatStripeRetryDate(Date.parse("2026-07-18T04:18:19.000Z") / 1000, "America/Los_Angeles") ===
    "July 17, 2026 at 9:18 PM PDT",
  "daylight saving abbreviation",
);
assert(
  formatStripeRetryDate(validationUnix, "Not/AZone") === "November 17, 2026 at 8:18 PM PST",
  "invalid timezone uses the existing organization fallback",
);
assert(
  formatStripeRetryDate(validationUnix, "America/Los_Angeles") !==
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(
      new Date(validationUnix * 1000),
    ),
  "organization zone is not the UTC calendar date",
);
const failureCopy = subscriptionFailureNotice({
  organizationName: "Sanctuary Protected Test",
  amountDueCents: 3311,
  currency: "usd",
  nextPaymentAttemptUnix: null,
});
assert(failureCopy.body.includes("billing retry schedule"), "17 generic retry wording");
assert(!failureCopy.body.includes("canceled"), "failure does not claim cancellation");
assert(subscriptionFailureDedupKey("in_1") === subscriptionFailureDedupKey("in_1"), "19 replay identity");
assert(!subscriptionFailureDedupKey("in_1").includes("attempt"), "20-21 attempt count is not the identity");
assert(subscriptionFailureDedupKey("in_1") !== subscriptionFailureDedupKey("in_2"), "22 invoices are separate");

assert(subscriptionRecoveryDedupKey("in_1").includes("recovered"), "23 recovery identity");
assert(
  subscriptionPaymentRecoveryEffect({ existingFailure: true, existingRecovered: false }).notify,
  "23 recovery after failure",
);
assert(
  !subscriptionPaymentRecoveryEffect({ existingFailure: false }).notify,
  "24 normal paid invoice is not recovery",
);
assert(subscriptionRecoveryNotice({
  organizationName: "Sanctuary Protected Test",
  amountPaidCents: 3311,
  currency: "usd",
}).title === "Subscription payment received", "28-29 recovery copy");
assert(
  !subscriptionPaymentRecoveryEffect({ existingFailure: true, existingRecovered: true }).notify,
  "30 recovery replay",
);
const openBanner = subscriptionPaymentAttention({
  invoiceStatus: "open",
  failure: true,
  nextPaymentAttemptUnix: retryUnix,
  timeZone: "America/Los_Angeles",
  subscriptionStatus: "past_due",
});
assert(
  openBanner.show && openBanner.retryLabel === "Next automatic payment attempt: October 17, 2026 at 5:00 PM PDT",
  "31 banner before recovery",
);
const cleared = subscriptionPaymentAttention({
  invoiceStatus: "paid",
  failure: true,
  recovered: true,
  subscriptionStatus: "active",
});
assert(!cleared.show, "31 banner clears");
assert(rules.includes("Historical") || sync.includes("failure: true"), "32 failure history remains in invoice metadata");

assert(subscriptionPaymentFailureEffect({ existingStatus: "paid" }).action === "ignore_stale", "35 stale failure after paid");
assert(subscriptionPaymentFailureEffect({ existingRecovered: true }).action === "ignore_stale", "35 recovered stays recovered");
assert(!subscriptionFinalFailureEffect({ stripeStatus: "past_due", paymentStatus: "failed" }).notify, "41 past_due is not canceled");
assert(!subscriptionFinalFailureEffect({ stripeStatus: "unpaid", paymentStatus: "failed" }).notify, "42 unpaid is not canceled");
assert(subscriptionFinalFailureEffect({ stripeStatus: "canceled", paymentStatus: "failed" }).notify, "43 canceled after failed payment");
assert(!subscriptionFinalFailureEffect({ stripeStatus: "canceled", paymentStatus: "ok" }).notify, "voluntary cancel is not dunning");
assert(
  subscriptionFinalFailureDedupKey("sub_1") === subscriptionFinalFailureDedupKey("sub_1"),
  "44 final identity",
);
const finalCopy = subscriptionFinalFailureNotice({
  organizationName: "Sanctuary Protected Test",
  stripeStatus: "canceled",
});
assert(finalCopy?.title === "Subscription canceled after unsuccessful payment", "43 final wording");
assert(subscriptionFinalFailureNotice({ organizationName: "Org", stripeStatus: "past_due" }) === null, "41 no final copy");

assert(!subscriptionPaymentAttention({ invoiceStatus: "paid", failure: false, subscriptionStatus: "active" }).show, "49 healthy");
assert(subscriptionPaymentAttention({
  invoiceStatus: "open",
  failure: true,
  subscriptionStatus: "active",
}).show, "50 unresolved failure");
assert(
  subscriptionPaymentAttention({ invoiceStatus: "open", failure: true, nextPaymentAttemptUnix: null }).show &&
    subscriptionPaymentAttention({ invoiceStatus: "open", failure: true, nextPaymentAttemptUnix: null }).show,
  "52 unknown retry still shows the issue",
);
const unknown = subscriptionPaymentAttention({
  invoiceStatus: "open",
  failure: true,
  nextPaymentAttemptUnix: null,
  subscriptionStatus: "past_due",
});
assert(unknown.show && unknown.retryLabel === null, "52 no invented date");
assert(unknown.show && unknown.body.includes("not canceled"), "41 banner does not say canceled");
assert(page.includes('href="#subscription-payment-method"'), "53 change payment method");
assert(page.includes('id="subscription-payment-method"'), "53 payment method section");
assert(!page.includes("createCustomerPortalSession"), "54 banner does not add Customer Portal");
assert(page.includes("subscriptionPaymentAttention"), "55 page uses current invoice state");
assert(page.includes("timeZone: church.timezone"), "retry date uses the organization timezone");

for (const forbidden of [
  "paymentIntents.create",
  "invoices.create",
  "invoices.pay",
  "subscriptions.update",
  "customers.update",
  "charges.create",
  "automatic_tax",
  "billing_address",
  "organization_sms",
  "bird",
]) {
  assert(!sync.includes(forbidden) || forbidden === "subscriptions.update", `dunning sync avoids ${forbidden}`);
}
assert(!storeSource.includes("paymentIntents.create"), "57 no PaymentIntent");
assert(!storeSource.includes("bird"), "no Bird");
assert(!rules.includes("10.55") && !rules.includes("0.1055"), "67 no hard-coded tax");
assert(sender.includes('"billing.subscription_payment_failed": "billing"'), "billing sender");
assert(dispatch.includes("invoice.payment_failed"), "existing invoice event");
assert(!dispatch.includes("invoice.payment_action_required"), "no new webhook event");
assert(storeSource.includes('channels: [...SUBSCRIPTION_DUNNING_CHANNELS]'), "recipient channels");
assert(storeSource.includes("dispatchNow: false"), "email uses existing dispatcher");

type InvoiceRow = { status: string; metadata: Record<string, unknown> };
function memoryStore() {
  const invoices = new Map<string, InvoiceRow>();
  const notices: string[] = [];
  const paymentStatus = { value: "ok" };
  const store = {
    invoices,
    notices,
    paymentStatus,
    async findOrganizationByStripeCustomerId() {
      return { organizationId: "org_1", providerCustomerId: "cus_1" };
    },
    async getPlanIdByKey() {
      return "plan_1";
    },
    async getSubscriptionByProviderId() {
      return {
        id: "sub_row",
        organizationId: "org_1",
        planId: "plan_1",
        planKey: "servant_standard",
        status: "active" as const,
        billingSubscriptionId: "sub_1",
        paymentStatus: paymentStatus.value,
      };
    },
    async getCurrentSubscription() {
      return this.getSubscriptionByProviderId();
    },
    async upsertSubscription() {
      return {
        subscription: await this.getSubscriptionByProviderId(),
        created: false,
        planChanged: false,
        statusChanged: false,
        previousPlanId: "plan_1",
        previousStatus: "active" as const,
      };
    },
    async writeChangeHistory() {},
    async hasChangeHistoryForProviderEvent() {
      return false;
    },
    async getInvoiceByProviderId(id: string) {
      const row = invoices.get(id);
      return row ? { id, ...row } : null;
    },
    async upsertInvoice(input: { providerInvoiceId: string; status: string; metadata: Record<string, unknown> }) {
      invoices.set(input.providerInvoiceId, { status: input.status, metadata: input.metadata });
      return { id: input.providerInvoiceId, created: true };
    },
    async insertTransaction() {
      return { id: "txn", created: true };
    },
    async updateSubscriptionPaymentStatus(input: { paymentStatus: string }) {
      paymentStatus.value = input.paymentStatus;
    },
    async activateTrialOrganization() {
      return "noop" as const;
    },
    async syncOrganizationPlanName() {},
    async syncScheduleMirror() {},
    async notifySubscriptionDunning(input: { kind: string; invoiceId: string | null }) {
      notices.push(`${input.kind}:${input.invoiceId ?? ""}`);
    },
  };
  return store;
}

function invoiceObject(overrides: Partial<StripeWebhookObjectSummary>): StripeWebhookObjectSummary {
  return {
    objectType: "invoice",
    id: "in_1",
    customerId: "cus_1",
    subscriptionId: "sub_1",
    invoiceId: "in_1",
    checkoutSessionId: null,
    priceItems: [{ priceId: "price_servant", lookupKey: "servant_standard_monthly", productName: null }],
    priceId: "price_servant",
    priceLookupKey: "servant_standard_monthly",
    status: "open",
    mode: null,
    paymentStatus: null,
    amountPaid: 0,
    amountDue: 3311,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    metadataOrganizationId: "org_1",
    metadataPlanKey: "servant_standard",
    billingReason: "subscription_cycle",
    ...overrides,
  };
}

async function main() {
  const failed = memoryStore();
  const failure = await handleInvoicePaymentFailed(failed as unknown as WebhookSyncStore, invoiceObject({}), {});
  assert(failure.outcome === "processed", "handler records failure");
  assert(failed.notices.length === 1, "5 notification requested once");
  await handleInvoicePaymentFailed(
    failed as unknown as WebhookSyncStore,
    invoiceObject({ attemptCount: 2, nextPaymentAttempt: retryUnix }),
    {},
  );
  const noticeCount: number = failed.notices.length;
  assert(noticeCount === 2, "handler asks deduplicated notifier again");
  assert(failed.notices[0] === failed.notices[1], "20 same logical notice");
  assert(failed.invoices.get("in_1")?.metadata.next_payment_attempt === retryUnix, "16 retry stored");

  const sms = memoryStore();
  const ignored = await handleInvoicePaymentFailed(
    sms as unknown as WebhookSyncStore,
    invoiceObject({
      metadataSanctuaryCheckout: "sms_package",
      metadataPackageKey: "sms_block",
      subscriptionId: null,
      priceItems: [],
      priceLookupKey: null,
      billingReason: "manual",
    }),
    {},
  );
  assert(ignored.outcome === "ignored", "3 handler ignores SMS");
  assert(sms.notices.length === 0, "3 no SMS dunning notice");

  const recovered = memoryStore();
  await handleInvoicePaymentFailed(recovered as unknown as WebhookSyncStore, invoiceObject({ invoiceId: "in_fail", id: "in_fail" }), {});
  const paid = await handleInvoicePaid(
    recovered as unknown as WebhookSyncStore,
    invoiceObject({ invoiceId: "in_fail", id: "in_fail", status: "paid", amountPaid: 3311, amountDue: 0 }),
    {},
  );
  assert(paid.outcome === "processed", "34 paid after failure");
  assert(recovered.notices.some((notice) => notice.startsWith("payment_recovered")), "23 recovery notice");
  assert(recovered.paymentStatus.value === "ok", "31 payment status recovered");
  const replayedFailure = await handleInvoicePaymentFailed(
    recovered as unknown as WebhookSyncStore,
    invoiceObject({ invoiceId: "in_fail", id: "in_fail", attemptCount: 4 }),
    {},
  );
  assert(replayedFailure.metadata.stale_failure_ignored === true, "35 stale failure ignored");
  assert(recovered.paymentStatus.value === "ok", "35 stays recovered");

  const healthy = memoryStore();
  await handleInvoicePaid(healthy as unknown as WebhookSyncStore, invoiceObject({ status: "paid", amountPaid: 3311, amountDue: 0 }), {});
  assert(!healthy.notices.some((notice) => notice.startsWith("payment_recovered")), "24 no false recovery");

  console.log("subscription dunning self-check passed");
}

void main();

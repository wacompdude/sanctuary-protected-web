/**
 * Automatic SMS replenishment webhook settlement.
 * No Stripe network, Bird, or email calls.
 */
import { settleSmsReplenishmentPaymentEvent } from "@/lib/billing/stripe/sms-replenishment-webhook";
import { verifyStripeWebhookSignature } from "@/lib/billing/stripe/webhook-verify";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import type { SmsReplenishmentAttemptRecord } from "@/lib/billing/stripe/sms-replenishment-webhook";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const attemptId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";

function summary(overrides: Partial<StripeWebhookObjectSummary> = {}): StripeWebhookObjectSummary {
  return {
    objectType: "payment_intent",
    id: "pi_phase5c2_webhook",
    customerId: "cus_phase5c2",
    subscriptionId: null,
    invoiceId: null,
    checkoutSessionId: null,
    priceItems: [],
    priceId: null,
    priceLookupKey: null,
    status: "succeeded",
    mode: null,
    paymentStatus: null,
    amountPaid: null,
    amountDue: null,
    currency: "usd",
    hostedInvoiceUrl: null,
    periodStart: null,
    periodEnd: null,
    cancelAtPeriodEnd: null,
    metadataOrganizationId: organizationId,
    metadataPlanKey: "servant_standard",
    amount: 500,
    paymentIntentId: "pi_phase5c2_webhook",
    metadataSanctuaryPurpose: "sms_auto_replenishment",
    metadataReplenishmentAttemptId: attemptId,
    ...overrides,
  };
}

function memory(attempt: SmsReplenishmentAttemptRecord, options?: { disabled?: boolean }) {
  let grants = 0;
  let fails = 0;
  let current = { ...attempt };
  return {
    grants: () => grants,
    fails: () => fails,
    current: () => current,
    disabled: options?.disabled === true,
    store: {
      async getAttempt() {
        return current;
      },
      async getOrganizationCustomerId() {
        return "cus_phase5c2";
      },
      async grant(input: { amountCents: number; providerPaymentId: string }) {
        if (current.status === "succeeded") {
          return { ok: true, outcome: "duplicate" };
        }
        if (current.status !== "charging" && current.status !== "payment_pending") {
          return { ok: false, outcome: "invalid_state" };
        }
        if (input.amountCents !== current.expectedAmountCents) {
          return { ok: false, outcome: "idempotency_mismatch" };
        }
        grants += 1;
        current = {
          ...current,
          status: "succeeded",
          providerPaymentId: input.providerPaymentId,
        };
        return { ok: true, outcome: "recorded" };
      },
      async fail() {
        if (current.status === "failed") return { ok: true, outcome: "duplicate" };
        if (current.status === "succeeded") return { ok: false, outcome: "already_settled" };
        fails += 1;
        current = { ...current, status: "failed" };
        return { ok: true, outcome: "failed" };
      },
    },
  };
}

const baseAttempt: SmsReplenishmentAttemptRecord = {
  id: attemptId,
  organizationId,
  status: "payment_pending",
  expectedAmountCents: 500,
  currency: "USD",
  providerPaymentId: "pi_phase5c2_webhook",
  packageSegments: 50,
};

async function main() {
const badSignature = verifyStripeWebhookSignature({
  rawBody: "{}",
  headers: new Headers({ "stripe-signature": "t=1,v1=bad" }),
  webhookSecret: "whsec_phase5c2_test",
  constructEvent: () => {
    throw new Error("bad signature");
  },
});
assert(badSignature.ok === false, "invalid signature");

const settled = memory(baseAttempt, { disabled: true });
const success = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary(),
  store: settled.store,
});
assert(success.outcome === "processed", "success");
assert(settled.grants() === 1, "one grant");
assert(settled.disabled, "grant does not require config to stay enabled");
const duplicate = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary(),
  store: settled.store,
});
assert(duplicate.outcome === "processed" && settled.grants() === 1, "duplicate success");

const otherPurpose = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary({ metadataSanctuaryPurpose: "sms_package" }),
  store: settled.store,
});
assert(otherPurpose.outcome === "ignored", "other purpose");

const missingAttempt = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary({ metadataReplenishmentAttemptId: null }),
  store: settled.store,
});
assert(missingAttempt.outcome === "rejected", "missing attempt");

const wrongOrg = memory({ ...baseAttempt, status: "payment_pending" });
const orgMismatch = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary({ metadataOrganizationId: "33333333-3333-4333-8333-333333333333" }),
  store: wrongOrg.store,
});
assert(orgMismatch.outcome === "rejected" && wrongOrg.grants() === 0, "wrong organization");

const wrongPayment = memory(baseAttempt);
const paymentMismatch = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary({ paymentIntentId: "pi_other", id: "pi_other" }),
  store: wrongPayment.store,
});
assert(paymentMismatch.outcome === "rejected" && wrongPayment.grants() === 0, "wrong payment");

const wrongCustomer = memory({ ...baseAttempt, status: "charging", providerPaymentId: null });
const customerStore = {
  ...wrongCustomer.store,
  async getOrganizationCustomerId() {
    return "cus_other";
  },
};
const customerMismatch = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary(),
  store: customerStore,
});
assert(customerMismatch.outcome === "rejected" && wrongCustomer.grants() === 0, "wrong customer");

const wrongAmount = memory({ ...baseAttempt, status: "charging", providerPaymentId: null });
const amountMismatch = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary({ amount: 400 }),
  store: wrongAmount.store,
});
assert(amountMismatch.outcome === "rejected" && wrongAmount.grants() === 0, "wrong amount");

const wrongCurrency = memory({ ...baseAttempt, status: "charging", providerPaymentId: null });
const currencyMismatch = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary({ currency: "eur" }),
  store: wrongCurrency.store,
});
assert(currencyMismatch.outcome === "rejected" && wrongCurrency.grants() === 0, "wrong currency");

const early = memory({ ...baseAttempt, status: "claimed", providerPaymentId: null });
const tooEarly = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary(),
  store: early.store,
});
assert(tooEarly.outcome === "rejected" && early.grants() === 0, "claimed is not grantable");

const ambiguous = memory({ ...baseAttempt, status: "charging", providerPaymentId: null });
const afterAmbiguous = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.succeeded",
  object: summary(),
  store: ambiguous.store,
});
assert(afterAmbiguous.outcome === "processed" && ambiguous.grants() === 1, "webhook after ambiguous charging");

const failed = memory({ ...baseAttempt, status: "payment_pending" });
const firstFailure = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.payment_failed",
  object: summary({ status: "requires_payment_method" }),
  store: failed.store,
});
const secondFailure = await settleSmsReplenishmentPaymentEvent({
  eventType: "payment_intent.payment_failed",
  object: summary({ status: "requires_payment_method" }),
  store: failed.store,
});
assert(firstFailure.outcome === "processed" && failed.fails() === 1, "failure");
assert(secondFailure.outcome === "processed" && failed.fails() === 1 && failed.grants() === 0, "duplicate failure grants nothing");

console.log("sms replenishment webhook selfcheck passed");
}

main();

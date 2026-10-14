/**
 * Automatic SMS replenishment PaymentIntent rules.
 * No Stripe, database, Bird, or email calls.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifySmsReplenishmentPaymentError,
  classifySmsReplenishmentPaymentStatus,
  smsAutoReplenishmentPaymentIntentParams,
  smsAutoReplenishmentProviderIdempotencyKey,
  type SmsReplenishmentChargeSnapshot,
} from "@/lib/billing/stripe/sms-replenishment-payment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const attemptId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const snapshot: SmsReplenishmentChargeSnapshot = {
  attemptId,
  organizationId,
  paymentMethodId: "pm_phase5c2_card",
  customerId: "cus_phase5c2",
  expectedAmountCents: 500,
  currency: "USD",
  packageSegments: 50,
  planKey: "servant_standard",
  packageKey: "servant_standard_sms_50",
  providerIdempotencyKey: smsAutoReplenishmentProviderIdempotencyKey(attemptId),
  taxCents: 0,
  taxCalculationId: "taxcalc_phase5c2",
};

const params = smsAutoReplenishmentPaymentIntentParams(snapshot);
assert(params.off_session === true, "off session");
assert(params.confirm === true, "confirm");
assert(params.customer === "cus_phase5c2", "customer");
assert(params.payment_method === "pm_phase5c2_card", "payment method");
assert(params.amount === 500, "amount");
assert(params.hooks?.inputs.tax.calculation === "taxcalc_phase5c2", "tax calculation");
const taxed = smsAutoReplenishmentPaymentIntentParams({
  ...snapshot,
  taxCents: 43,
  taxCalculationId: "taxcalc_phase5c3",
});
assert(taxed.amount === 543, "total includes tax");
assert(taxed.metadata.sms_segments === "50", "quantity ignores tax");
assert(params.currency === "usd", "usd");
assert(
  params.allowed_payment_method_types.length === 1 &&
    params.allowed_payment_method_types[0] === "card",
  "card only",
);
assert(!("automatic_payment_methods" in params), "no automatic payment methods");
assert(params.metadata.sanctuary_purpose === "sms_auto_replenishment", "purpose");
assert(params.metadata.organization_id === organizationId, "organization");
assert(params.metadata.replenishment_attempt_id === attemptId, "attempt");
assert(params.metadata.plan_key === "servant_standard", "plan");
assert(params.metadata.sms_segments === "50", "segments");
assert(!JSON.stringify(params).includes("@"), "metadata has no email");
assert(!JSON.stringify(params).includes("client_secret"), "no client secret");

const again = smsAutoReplenishmentPaymentIntentParams(snapshot);
assert(
  smsAutoReplenishmentProviderIdempotencyKey(attemptId) === snapshot.providerIdempotencyKey,
  "stable idempotency",
);
assert(JSON.stringify(again) === JSON.stringify(params), "same attempt same request");

const succeeded = classifySmsReplenishmentPaymentStatus({
  id: "pi_phase5c2_ok",
  status: "succeeded",
});
assert(succeeded.disposition === "pending_webhook" && succeeded.grantsCredits === false, "sync success does not grant");

const processing = classifySmsReplenishmentPaymentStatus({
  id: "pi_phase5c2_processing",
  status: "processing",
});
assert(processing.disposition === "pending_webhook", "processing stays pending");

for (const status of ["requires_action", "requires_payment_method", "canceled"] as const) {
  const failed = classifySmsReplenishmentPaymentStatus({ id: "pi_phase5c2_stop", status });
  assert(failed.disposition === "definitive_failure" && failed.grantsCredits === false, status);
}

const declined = classifySmsReplenishmentPaymentError({
  type: "StripeCardError",
  code: "card_declined",
  providerPaymentId: "pi_phase5c2_decline",
});
assert(declined.disposition === "definitive_failure", "decline");
assert(declined.disposition === "definitive_failure" && declined.safeFailureCode === "card_declined", "decline code");

const ambiguous = classifySmsReplenishmentPaymentError({
  type: "StripeConnectionError",
  code: "connection_error",
  providerPaymentId: null,
});
assert(ambiguous.disposition === "ambiguous" && ambiguous.grantsCredits === false, "ambiguous");

let rejected = false;
try {
  smsAutoReplenishmentPaymentIntentParams({ ...snapshot, customerId: "not-a-customer" });
} catch {
  rejected = true;
}
assert(rejected, "mismatched customer shape blocked");

rejected = false;
try {
  smsAutoReplenishmentPaymentIntentParams({ ...snapshot, paymentMethodId: "ba_bank" });
} catch {
  rejected = true;
}
assert(rejected, "non-card payment method id blocked");

rejected = false;
try {
  smsAutoReplenishmentPaymentIntentParams({
    ...snapshot,
    providerIdempotencyKey: "sms_auto_pi_different",
  });
} catch {
  rejected = true;
}
assert(rejected, "changed idempotency key blocked");

const live = readFileSync(
  join(process.cwd(), "lib/billing/stripe/sms-replenishment-live.ts"),
  "utf8",
);
const dispatch = readFileSync(
  join(process.cwd(), "lib/notifications/dispatch-notification.ts"),
  "utf8",
);
assert(!live.includes("grantsCredits: true"), "execution cannot grant");
assert(!live.includes("claim_application_sms_replenishment"), "execution does not claim");
assert(!dispatch.includes("executeAutomaticSmsReplenishmentAttempt"), "send path does not execute");
assert(!dispatch.includes("claim_application_sms_replenishment"), "send path does not claim");
assert(!live.includes("client_secret"), "execution does not handle a client secret");

console.log("sms replenishment payment selfcheck passed");

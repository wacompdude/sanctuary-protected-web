/**
 * Base-subscription payment-method replacement checks.
 * No Stripe, database, or network calls.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SMS_PAYMENT_SETUP_PURPOSE } from "@/lib/billing/stripe/sms-payment-setup";
import type {
  PaymentMethodVerificationSnapshot,
  SetupIntentVerificationSnapshot,
} from "@/lib/billing/stripe/sms-payment-setup";
import { safeCardDisplay } from "@/lib/billing/stripe/sms-payment-setup";
import {
  canReplaceSubscriptionPaymentMethod,
  effectiveSubscriptionPaymentMethodId,
  subscriptionDefaultPaymentMethodUpdate,
  subscriptionPaymentMethodSetupParams,
  verifySubscriptionPaymentMethodSetup,
} from "@/lib/billing/stripe/subscription-payment-method";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const rules = readRepo("lib/billing/stripe/subscription-payment-method.ts");
const live = readRepo("lib/billing/stripe/subscription-payment-method-live.ts");
const actions = readRepo("app/(app)/settings/billing/subscription-payment-method-actions.ts");
const panel = readRepo("components/billing/subscription-payment-method-panel.tsx");
const page = readRepo("app/(app)/settings/billing/page.tsx");
const smsRules = readRepo("lib/billing/stripe/sms-payment-setup.ts");
const smsLive = readRepo("lib/billing/stripe/sms-payment-setup-live.ts");
const smsActions = readRepo("app/(app)/settings/billing/sms-payment-setup-actions.ts");

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const customerA = "cus_org_a";
const customerB = "cus_org_b";
const subscriptionA = "sub_org_a";
const subscriptionB = "sub_org_b";
const paymentMethodA = "pm_card_a";
const paymentMethodB = "pm_card_b";

function card(
  id: string,
  customerId: string,
  type = "card",
): PaymentMethodVerificationSnapshot {
  return {
    id,
    type,
    customerId,
    card:
      type === "card"
        ? { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 }
        : null,
  };
}

function setup(overrides: Partial<SetupIntentVerificationSnapshot> = {}): SetupIntentVerificationSnapshot {
  return {
    id: "seti_subscription_a",
    status: "succeeded",
    usage: "off_session",
    customerId: customerA,
    paymentMethodId: paymentMethodA,
    purpose: "subscription_payment_method_replacement",
    organizationId: orgA,
    ...overrides,
  };
}

function verify(
  overrides: Partial<{
    organizationId: string;
    customerId: string;
    subscriptionId: string;
    setupIntent: SetupIntentVerificationSnapshot | null;
    paymentMethod: PaymentMethodVerificationSnapshot | null;
    setupSubscriptionId: string | null;
  }> = {},
) {
  return verifySubscriptionPaymentMethodSetup({
    organizationId: orgA,
    customerId: customerA,
    subscriptionId: subscriptionA,
    setupIntent: setup(),
    paymentMethod: card(paymentMethodA, customerA),
    setupSubscriptionId: subscriptionA,
    ...overrides,
  });
}

assert(canReplaceSubscriptionPaymentMethod("owner"), "1 owner can replace");
assert(canReplaceSubscriptionPaymentMethod("co_owner"), "2 co-owner can replace");
for (const role of [
  "administrator",
  "security_leader",
  "security_member",
  "viewer",
  null,
]) {
  assert(!canReplaceSubscriptionPaymentMethod(role), `denied ${role ?? "unauthenticated"}`);
}
assert(actions.includes("requireBillingManageAccess()"), "actions enforce billing manage access");
assert(
  actions.indexOf("requireBillingManageAccess") < actions.indexOf("createSubscriptionPaymentMethodSetup"),
  "setup creation is authorized before Stripe",
);
assert(
  actions.indexOf("requireBillingManageAccess") <
    actions.indexOf("finalizeSubscriptionPaymentMethodSetup"),
  "finalization is authorized before Stripe",
);

const foreign = verify({
  setupIntent: setup({ organizationId: orgB }),
  setupSubscriptionId: subscriptionA,
});
assert(!foreign.ok && foreign.outcome === "wrong_organization", "8 foreign organization setup rejected");
const foreignSubscription = verify({
  setupIntent: setup(),
  setupSubscriptionId: subscriptionB,
});
assert(
  !foreignSubscription.ok && foreignSubscription.outcome === "wrong_subscription",
  "9 foreign subscription rejected",
);
assert(!actions.includes("customerId"), "10 browser customer id is not accepted");
assert(!actions.includes("subscriptionId"), "11 browser subscription id is not accepted");
assert(live.includes("canonicalBillingTarget"), "server resolves customer and subscription");

const smsSetup = verify({
  setupIntent: setup({ purpose: SMS_PAYMENT_SETUP_PURPOSE }),
});
assert(!smsSetup.ok && smsSetup.outcome === "sms_setup_intent", "12 SMS setup cannot finalize subscription");
assert(!live.includes("organization_sms_auto_replenishment"), "13 subscription flow does not write SMS payment method");
assert(!actions.includes("organization_sms_auto_replenishment"), "13 actions do not write SMS payment method");
assert(!smsLive.includes("subscriptionDefaultPaymentMethodUpdate"), "SMS flow does not update subscription");
assert(!smsActions.includes("subscriptions.update"), "SMS actions do not update subscription");
assert(smsRules.includes(SMS_PAYMENT_SETUP_PURPOSE), "SMS purpose remains separate");

const pending = verify({ setupIntent: setup({ status: "requires_action" }) });
assert(!pending.ok && pending.outcome === "not_succeeded", "14 setup must succeed");
const wrongCustomer = verify({ setupIntent: setup({ customerId: customerB }) });
assert(!wrongCustomer.ok && wrongCustomer.outcome === "wrong_customer", "15 customer must match");
const notCard = verify({ paymentMethod: card(paymentMethodA, customerA, "us_bank_account") });
assert(!notCard.ok && notCard.outcome === "unsupported_payment_method", "16 payment method must be card");
const otherCard = verify({ paymentMethod: card(paymentMethodB, customerA) });
assert(!otherCard.ok && otherCard.outcome === "payment_method_missing", "17 payment method must match setup");

const accepted = verify();
assert(accepted.ok, "18 verified setup is accepted");
const update = subscriptionDefaultPaymentMethodUpdate(paymentMethodA);
assert(
  Object.keys(update).length === 1 && update.default_payment_method === paymentMethodA,
  "18 update sets only default_payment_method",
);
assert(live.includes("subscriptionDefaultPaymentMethodUpdate("), "live update uses the narrow payload");
assert(!live.includes("customers.update"), "19 customer invoice default is not changed");
assert(!rules.includes("invoice_settings"), "rules do not set customer default");

const duplicate = subscriptionDefaultPaymentMethodUpdate(paymentMethodA);
assert(
  duplicate.default_payment_method === update.default_payment_method &&
    Object.keys(duplicate).length === 1,
  "28 duplicate finalization sends the same narrow update",
);

const forbidden = [
  "automatic_tax",
  "proration_behavior",
  "billing_cycle_anchor",
  "cancel_at",
  "cancel_at_period_end",
  "quantity",
  "collection_method",
  "items:",
];
for (const field of forbidden) {
  assert(!rules.includes(field), `update rules omit ${field}`);
}
assert(live.includes("automatic_tax?.enabled"), "21 tax flag is read back and must stay enabled");
assert(!live.includes("automatic_tax:"), "21 tax is not written");
assert(!live.includes("paymentMethods.detach"), "old payment method is not detached");
assert(!live.includes("invoices.create"), "27 application does not create an invoice");
assert(!live.includes("paymentIntents.create"), "27 application does not create a payment intent");

const effective = effectiveSubscriptionPaymentMethodId({
  subscriptionDefaultPaymentMethodId: paymentMethodA,
  customerInvoiceDefaultPaymentMethodId: paymentMethodB,
});
assert(effective === paymentMethodA, "29 subscription default wins over customer default");
const fallback = effectiveSubscriptionPaymentMethodId({
  subscriptionDefaultPaymentMethodId: null,
  customerInvoiceDefaultPaymentMethodId: paymentMethodB,
});
assert(fallback === paymentMethodB, "customer default is used only when subscription default is absent");
const display = safeCardDisplay(card(paymentMethodA, customerA));
assert(display?.brand === "visa" && display.last4 === "4242", "29 safe card display");
assert(display && !("number" in display) && !("cvc" in display), "30-31 PAN and CVC are not returned");
assert(!panel.includes("4242"), "panel does not hard-code a test card");
assert(page.includes("Subscription payment method"), "billing page shows the section");
assert(panel.includes("Payment method will be added when paid billing begins."), "32 no-subscription copy");
assert(
  !page.includes("createSubscriptionPaymentMethodSetup"),
  "32 page load does not create a SetupIntent",
);
const reader = live.slice(live.indexOf("function readSubscriptionPaymentMethodView"));
assert(
  reader.indexOf('state: "no_subscription"') < reader.indexOf("getStripeClient("),
  "32 missing subscription returns before Stripe",
);
assert(actions.includes("Unable to start subscription payment method setup."), "33 setup failure is safe");
assert(actions.includes("The subscription payment method could not be saved."), "34 update failure is safe");
assert(!live.includes("billing_address"), "35 canonical billing address is not written");
assert(!live.includes("Customer.address"), "35 customer address is not written");
assert(panel.includes("not change the plan, tax address"), "panel states tax address is unchanged");
assert(panel.includes("PaymentElement"), "client uses Stripe Payment Element");
assert(!panel.includes("STRIPE_SECRET"), "client does not reference the secret key");
assert(rules.includes('allowed_payment_method_types: ["card"]'), "setup is card only");
assert(rules.includes('usage: "off_session"'), "setup is off session");

const params = subscriptionPaymentMethodSetupParams({
  customerId: customerA,
  organizationId: orgA,
  subscriptionId: subscriptionA,
});
assert(params.metadata.sanctuary_purpose === "subscription_payment_method_replacement", "purpose metadata");
assert(!JSON.stringify(params.metadata).includes("@"), "metadata has no email");

console.log("subscription payment method self-check passed");

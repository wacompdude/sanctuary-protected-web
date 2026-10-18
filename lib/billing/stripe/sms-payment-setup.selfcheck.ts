/**
 * Static checks for SMS auto-replenishment payment-method setup.
 * No Stripe, Bird, Supabase, or email calls.
 * Run: npm run selfcheck:sms:payment-setup
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canManageSmsAutoReplenishment } from "@/lib/billing/sms-auto-replenishment";
import {
  persistedPaymentSetupIsChargeable,
  readSetupIntentIdFromClient,
  safeCardDisplay,
  smsPaymentSetupCreateParams,
  smsPaymentSetupIdempotencyKey,
  SMS_PAYMENT_METHOD_SAVED_NOTICE,
  SMS_PAYMENT_SETUP_PURPOSE,
  verifySmsPaymentSetup,
  type PaymentMethodVerificationSnapshot,
  type SetupIntentVerificationSnapshot,
} from "@/lib/billing/stripe/sms-payment-setup";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRepo(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const setup = readRepo("lib/billing/stripe/sms-payment-setup.ts");
const live = readRepo("lib/billing/stripe/sms-payment-setup-live.ts");
const actions = readRepo("app/(app)/settings/billing/sms-payment-setup-actions.ts");
const panel = readRepo("components/billing/sms-payment-setup-panel.tsx");
const page = readRepo("app/(app)/settings/billing/page.tsx");
const migration = readRepo(
  "supabase/migrations/111_sms_auto_replenishment_payment_method.sql",
);
const manualCheckout = readRepo("app/(app)/settings/billing/actions.ts");
const dispatch = readRepo("lib/notifications/dispatch-notification.ts");
const access = readRepo("lib/billing/access.ts");

assert(live.includes("server-only"), "SetupIntent creation module is server-only");
assert(!panel.includes("STRIPE_SECRET_KEY"), "client panel has no secret key");
assert(!panel.includes("paymentIntents"), "panel does not create a PaymentIntent");
assert(live.includes("setupIntents.create"), "server creates a SetupIntent");
assert(!live.includes("paymentIntents"), "setup flow does not create a PaymentIntent");
assert(!live.includes("paymentMethods.detach"), "removal does not detach a payment method");
assert(!actions.includes("paymentIntents"), "actions do not create a PaymentIntent");
assert(!actions.includes("claim_application_sms_replenishment"), "setup does not claim");
assert(
  !actions.includes("record_automatic_application_sms_replenishment"),
  "setup does not grant credits",
);
assert(!actions.includes(".detach("), "actions do not detach");
assert(!dispatch.includes("claim_application_sms_replenishment"), "send path is unchanged");
assert(
  !manualCheckout.includes("record_application_sms_replenishment_payment_method"),
  "manual billing actions are unchanged",
);
assert(access.includes('["owner", "co_owner"]'), "billing manage roles");
assert(actions.includes("requireBillingManageAccess"), "server authorization");
assert(!actions.includes("formData.get(\"organization"), "browser organization is not read");
assert(!actions.includes("customerId:"), "action result does not accept a browser customer");
assert(live.includes("ensureStripeCustomerForOrganization"), "canonical customer path");
assert(live.includes("organization_billing_profiles") || readRepo("lib/billing/stripe/customers.ts").includes("organization_billing_profiles"), "canonical profile");
assert(setup.includes(SMS_PAYMENT_SETUP_PURPOSE), "purpose constant");
assert(migration.includes("'disabled'"), "new configuration is disabled");
assert(!migration.includes("'enabled'") || migration.includes("v_cfg.status = 'enabled'"), "migration does not insert enabled");
assert(migration.includes("payment_method_changed"), "audit action");
assert(!migration.includes("organization_sms_credit_ledger"), "no ledger write");
assert(!migration.includes("billing_transactions"), "no billing transaction");
assert(!migration.includes("organization_sms_replenishment_attempts"), "no replenishment attempt");
assert(migration.includes("payment_attention_required"), "enabled removal is non-chargeable");
assert(!migration.includes("api.stripe.com"), "migration does not call Stripe");
assert(panel.includes("does not enable Auto-Replenishment"), "setup copy");
assert(panel.includes("Automatic replenishment is not enabled."), "disabled status remains separate");
assert(panel.includes("SMS_PAYMENT_METHOD_SAVED_NOTICE"), "A saved notice is shared");
assert(panel.includes("notePaymentMethodSaved"), "save uses the neutral notice");
assert(
  SMS_PAYMENT_METHOD_SAVED_NOTICE ===
    "Payment method saved. Saving or changing this card does not change your automatic replenishment setting or charge the card.",
  "A exact success message",
);
assert(
  !SMS_PAYMENT_METHOD_SAVED_NOTICE.includes("Automatic replenishment is not enabled"),
  "B success message does not claim replenishment is off",
);
assert(!panel.includes("Payment method saved. Automatic replenishment is not enabled."), "B old success text is gone");
assert(panel.includes("setClientSecret(null)"), "C successful save clears the setup form");
assert(panel.includes("function CardSummary"), "D saved-card summary remains");
assert(panel.includes("Replace payment method"), "E replace reopens setup");
assert(panel.includes("startSmsPaymentSetupAction"), "E replace uses the existing setup action");
assert(panel.includes("Remove auto-replenishment payment method"), "F remove control remains");
assert(panel.includes("removeSmsPaymentSetupAction"), "F remove action remains");
assert(panel.includes("Automatic SMS payment method removed. No card was charged."), "F remove notice remains");
assert(migration.includes("WHEN v_found THEN v_cfg.status"), "G J replacement keeps status");
assert(
  migration.includes("v_payment IS NULL AND v_cfg.status = 'enabled'"),
  "J only removing an enabled card requires payment attention",
);
assert(!panel.includes("sms-replenishment-orchestrator"), "H panel does not call replenishment execution");
assert(!actions.includes("sms-replenishment-orchestrator"), "H actions do not call replenishment execution");
assert(!actions.includes("paymentIntents.create"), "I actions do not charge");
assert(!panel.includes("Enable Auto-Replenishment"), "no enable control");

assert(canManageSmsAutoReplenishment("owner"), "owner allowed");
assert(canManageSmsAutoReplenishment("co_owner"), "co-owner allowed");
assert(!canManageSmsAutoReplenishment("administrator"), "administrator denied");
assert(!canManageSmsAutoReplenishment("security_member"), "unrelated member denied");
assert(!canManageSmsAutoReplenishment("viewer"), "viewer denied");

const params = smsPaymentSetupCreateParams({
  customerId: "cus_server",
  organizationId: "org_server",
});
assert(params.customer === "cus_server", "server customer");
assert(params.usage === "off_session", "off-session usage");
assert(
  params.allowed_payment_method_types.length === 1 &&
    params.allowed_payment_method_types[0] === "card",
  "card only",
);
assert(!("payment_method_types" in params), "obsolete payment_method_types is absent");
assert(
  !/(?<!allowed_)payment_method_types/.test(setup),
  "create helper does not send the obsolete parameter",
);
assert(params.metadata.sanctuary_purpose === SMS_PAYMENT_SETUP_PURPOSE, "purpose");
assert(params.metadata.organization_id === "org_server", "server organization metadata");
assert(!JSON.stringify(params).includes("sk_"), "create params have no secret");
assert(!JSON.stringify(params).includes("client_secret"), "create params have no client secret");
assert(actions.includes("logStripeBillingError"), "safe Stripe error log");
assert(actions.includes("sms_payment_setup_create"), "setup operation name");
assert(!actions.includes("client_secret"), "actions do not log a client secret");
assert(!actions.includes("console.error(error"), "actions do not log the raw error");
assert(setup.includes("setupIntent.customerId !== input.customerId"), "customer check remains");
assert(setup.includes("setupIntent.organizationId !== input.organizationId"), "organization check remains");
assert(setup.includes("setupIntent.purpose !== SMS_PAYMENT_SETUP_PURPOSE"), "purpose check remains");
assert(setup.includes('setupIntent.status !== "succeeded"'), "succeeded check remains");
assert(setup.includes('paymentMethod.type !== SMS_PAYMENT_SETUP_METHOD_TYPE'), "card type check remains");
assert(!live.includes("bird") && !actions.includes("bird"), "setup does not call Bird");
assert(!live.includes("billing_transactions"), "setup does not write a billing transaction");

assert(
  smsPaymentSetupIdempotencyKey("org", null) === smsPaymentSetupIdempotencyKey("org", null),
  "repeat setup reuses the idempotency key",
);
assert(
  smsPaymentSetupIdempotencyKey("org", "pm_saved") !== smsPaymentSetupIdempotencyKey("org", null),
  "replacement uses a new idempotency key",
);
assert(readSetupIntentIdFromClient("seti_phase5c") === "seti_phase5c", "setup intent id");
assert(readSetupIntentIdFromClient("cus_browser") === null, "customer id is not a setup intent");
assert(readSetupIntentIdFromClient({ organizationId: "org" }) === null, "object is not a setup intent");

function cardMethod(
  overrides: Partial<PaymentMethodVerificationSnapshot> = {},
): PaymentMethodVerificationSnapshot {
  return {
    id: "pm_phase5c_card",
    type: "card",
    customerId: "cus_org",
    card: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 },
    ...overrides,
  };
}

function succeededSetup(
  overrides: Partial<SetupIntentVerificationSnapshot> = {},
): SetupIntentVerificationSnapshot {
  return {
    id: "seti_phase5c",
    status: "succeeded",
    usage: "off_session",
    customerId: "cus_org",
    paymentMethodId: "pm_phase5c_card",
    purpose: SMS_PAYMENT_SETUP_PURPOSE,
    organizationId: "org_a",
    ...overrides,
  };
}

const verified = verifySmsPaymentSetup({
  organizationId: "org_a",
  customerId: "cus_org",
  setupIntent: succeededSetup(),
  paymentMethod: cardMethod(),
});
assert(verified.ok === true && verified.paymentMethodId === "pm_phase5c_card", "persists payment method id");
assert(verified.ok === true && verified.display?.last4 === "4242", "safe display");
assert(!JSON.stringify(verified).includes("cvc"), "no cvc");
assert(!JSON.stringify(verified).toLowerCase().includes("4242424242424242"), "no pan");
assert(!persistedPaymentSetupIsChargeable("disabled"), "disabled is not chargeable");

function rejects(outcome: string, setupIntent: SetupIntentVerificationSnapshot | null, paymentMethod: PaymentMethodVerificationSnapshot | null, organizationId = "org_a", customerId = "cus_org") {
  const result = verifySmsPaymentSetup({ organizationId, customerId, setupIntent, paymentMethod });
  assert(result.ok === false && result.outcome === outcome, outcome);
}

rejects("wrong_customer", succeededSetup({ customerId: "cus_other" }), cardMethod());
rejects("wrong_organization", succeededSetup({ organizationId: "org_b" }), cardMethod());
rejects("wrong_purpose", succeededSetup({ purpose: "subscription" }), cardMethod());
rejects("not_succeeded", succeededSetup({ status: "requires_payment_method" }), cardMethod());
rejects("not_off_session", succeededSetup({ usage: "on_session" }), cardMethod());
rejects("payment_method_missing", succeededSetup({ paymentMethodId: null }), null);
rejects("unsupported_payment_method", succeededSetup(), cardMethod({ type: "us_bank_account", card: null }));
rejects(
  "payment_method_customer_mismatch",
  succeededSetup(),
  cardMethod({ customerId: "cus_other_org" }),
);
rejects("setup_intent_missing", null, cardMethod());

const display = safeCardDisplay(cardMethod());
assert(display?.brand === "visa" && display.last4 === "4242", "display fields");
assert(
  safeCardDisplay(cardMethod({ card: { brand: "visa", last4: "4242424242424242", expMonth: 12, expYear: 2030 } })) === null,
  "pan-length last4 is rejected",
);

assert(page.includes("SmsPaymentSetupPanel"), "billing page mounts setup");
assert(!page.includes("paymentIntents.create"), "page does not create a PaymentIntent");

console.log("sms payment setup selfcheck passed");

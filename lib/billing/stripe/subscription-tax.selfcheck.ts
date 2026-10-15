/**
 * Subscription Stripe Tax rules. No Stripe network, charges, or SMS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BillingCheckoutPlanError } from "@/lib/billing/errors";
import {
  createSubscriptionCheckoutSession,
  type StripeCheckoutSessionCreateApi,
} from "@/lib/billing/stripe/checkout";
import type { BillingCustomerMappingStore } from "@/lib/billing/stripe/customers";
import type { StripePriceSnapshot } from "@/lib/billing/stripe/catalog";
import { buildDowngradeScheduleUpdate } from "@/lib/billing/stripe/downgrade";
import {
  buildSubscriptionUpgradeUpdate,
  UPGRADE_BILLING_CYCLE_ANCHOR,
  UPGRADE_PRORATION_BEHAVIOR,
} from "@/lib/billing/stripe/upgrade";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import {
  assertSubscriptionTaxCheckoutReady,
  formatSubscriptionInvoiceAmounts,
  interpretSubscriptionInvoiceMoney,
  SUBSCRIPTION_INVOICE_TAX_UNDETERMINED,
  SUBSCRIPTION_TAX_ADDRESS_REQUIRED,
  subscriptionCheckoutAutomaticTaxFields,
  subscriptionScheduleAutomaticTax,
  subscriptionTaxCollectionAuthorized,
  subscriptionUpgradeAutomaticTax,
} from "@/lib/billing/stripe/subscription-tax";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(subscriptionTaxCollectionAuthorized(undefined) === false, "subscription tax defaults off");
assert(subscriptionTaxCollectionAuthorized("true") === false, "true is not authorization");
assert(subscriptionTaxCollectionAuthorized("authorized") === true, "explicit authorization");
assert(subscriptionCheckoutAutomaticTaxFields(false) === null, "checkout tax off");
const on = subscriptionCheckoutAutomaticTaxFields(true);
assert(on?.automatic_tax.enabled === true, "checkout tax on");
assert(!("billing_address_collection" in (on ?? {})), "no checkout address collection");
assert(!("customer_update" in (on ?? {})), "checkout does not update the canonical address");

let blocked = false;
try {
  assertSubscriptionTaxCheckoutReady({ authorized: true, billingAddressComplete: false });
} catch (error) {
  blocked = error instanceof BillingCheckoutPlanError && error.message === SUBSCRIPTION_TAX_ADDRESS_REQUIRED;
}
assert(blocked, "incomplete address blocks tax-enabled checkout");
assertSubscriptionTaxCheckoutReady({ authorized: false, billingAddressComplete: false });
assertSubscriptionTaxCheckoutReady({ authorized: true, billingAddressComplete: true });

const legacy = interpretSubscriptionInvoiceMoney({
  amountSubtotal: null,
  amountTax: null,
  amountTotal: null,
  amountPaid: 3995,
  amountDue: 0,
});
assert(legacy.taxDetermined === false && legacy.subtotalCents === 3995 && legacy.totalCents === 3995, "historical invoice stays one amount");
const zero = interpretSubscriptionInvoiceMoney({
  amountSubtotal: 0,
  amountTax: 0,
  amountTotal: 0,
  amountPaid: 0,
  amountDue: 0,
});
assert(zero.taxDetermined && zero.taxCents === 0 && zero.totalCents === 0, "stripe zero tax is explicit");
const taxed = interpretSubscriptionInvoiceMoney({
  amountSubtotal: 3995,
  amountTax: 412,
  amountTotal: 4407,
  amountPaid: 4407,
  amountDue: 0,
});
assert(taxed.subtotalCents === 3995 && taxed.taxCents === 412 && taxed.totalCents === 4407, "subtotal tax and total stay separate");
let mismatch = false;
try {
  interpretSubscriptionInvoiceMoney({
    amountSubtotal: 3995,
    amountTax: 0,
    amountTotal: 4407,
    amountPaid: 4407,
    amountDue: 0,
  });
} catch (error) {
  mismatch = error instanceof Error && error.message === SUBSCRIPTION_INVOICE_TAX_UNDETERMINED;
}
assert(mismatch, "inconsistent tax is not stored as zero");
assert(
  formatSubscriptionInvoiceAmounts({ ...taxed, taxDetermined: true }).includes("Tax $4.12"),
  "history shows stripe tax",
);
assert(
  !formatSubscriptionInvoiceAmounts(legacy).includes("Tax"),
  "undetermined tax is not displayed as zero",
);

const upgradeOff = buildSubscriptionUpgradeUpdate({
  subscriptionId: "sub_1",
  baseItemId: "si_1",
  targetPriceId: "price_1",
});
assert(!("automatic_tax" in upgradeOff.params), "upgrade leaves tax untouched when gated off");
assert(upgradeOff.params.proration_behavior === UPGRADE_PRORATION_BEHAVIOR, "upgrade proration unchanged");
assert(upgradeOff.params.billing_cycle_anchor.type === UPGRADE_BILLING_CYCLE_ANCHOR.type, "billing cycle unchanged");
const upgradeOn = buildSubscriptionUpgradeUpdate({
  subscriptionId: "sub_1",
  baseItemId: "si_1",
  targetPriceId: "price_1",
  automaticTax: true,
});
assert(upgradeOn.params.automatic_tax?.enabled === true, "authorized upgrade keeps automatic tax");
assert(upgradeOn.params.proration_behavior === "always_invoice", "proration remains always_invoice");

const downgradeOff = buildDowngradeScheduleUpdate({
  currentBasePriceId: "price_high",
  currentBaseQuantity: 1,
  targetPriceId: "price_low",
  addons: [],
  periodStart: 100,
  periodEnd: 200,
});
assert(!("default_settings" in downgradeOff), "downgrade leaves tax untouched when gated off");
assert(downgradeOff.phases[0].end_date === 200 && downgradeOff.phases[1].start_date === 200, "downgrade timing unchanged");
assert(downgradeOff.proration_behavior === "none", "downgrade proration unchanged");
const downgradeOn = buildDowngradeScheduleUpdate({
  currentBasePriceId: "price_high",
  currentBaseQuantity: 1,
  targetPriceId: "price_low",
  addons: [],
  periodStart: 100,
  periodEnd: 200,
  automaticTax: true,
});
assert(downgradeOn.default_settings?.automatic_tax.enabled === true, "scheduled downgrade keeps automatic tax");
assert(subscriptionUpgradeAutomaticTax(false) === null, "upgrade helper off");
assert(subscriptionScheduleAutomaticTax(true)?.default_settings.automatic_tax.enabled === true, "schedule helper on");

const price = (lookupKey: string): StripePriceSnapshot => ({
  id: "price_steward",
  productId: "prod_selfcheck",
  lookupKey,
  active: true,
  currency: "usd",
  type: "recurring",
  recurringInterval: "month",
  unitAmount: 3995,
});
const store: BillingCustomerMappingStore = {
  async getMappedCustomerId() {
    return "cus_existing";
  },
  async saveMappedCustomerId() {
    throw new Error("duplicate customer");
  },
  async getBillingContact() {
    return { email: null, name: null, organizationName: null };
  },
};
let creates = 0;
let synced = "";
let automaticTax = false;
async function main() {
const checkout: StripeCheckoutSessionCreateApi = {
  async createSubscriptionCheckoutSession(input) {
    creates += 1;
    automaticTax = input.automaticTax === true;
    assert(input.customerId === "cus_existing", "canonical customer");
    assert(input.priceId === "price_steward", "existing price");
    return { id: "cs_test", url: "https://checkout.stripe.test/c/cs_test" };
  },
};
const sessionInput = {
  organizationId: "org_1",
  planKey: PLAN_KEYS.STEWARD_PRO,
  origin: "https://app.example.test",
  successUrl: "https://app.example.test/settings/billing?checkout=success",
  cancelUrl: "https://app.example.test/settings/billing?checkout=cancelled",
  attemptToken: "tok_tax",
  stripeSecretKey: "sk_test_phase5c3b_selfcheck_NOT_A_REAL_SECRET",
};
await createSubscriptionCheckoutSession(
  { ...sessionInput, subscriptionTaxAuthorized: true, billingAddressComplete: true },
  {
    listPrices: async (lookupKey) => [price(lookupKey)],
    store,
    stripeCustomers: { async createCustomer() { throw new Error("duplicate customer"); } },
    stripeCheckout: checkout,
    syncCustomerAddress: async (customerId) => {
      synced = customerId;
    },
  },
);
assert(creates === 1 && automaticTax && synced === "cus_existing", "authorized checkout syncs the existing customer and enables tax");

let refused = false;
try {
  await createSubscriptionCheckoutSession(
    { ...sessionInput, subscriptionTaxAuthorized: true, billingAddressComplete: false },
    {
      listPrices: async () => {
        throw new Error("must not resolve a price");
      },
      store,
      stripeCustomers: { async createCustomer() { throw new Error("duplicate customer"); } },
      stripeCheckout: checkout,
    },
  );
} catch (error) {
  refused = error instanceof BillingCheckoutPlanError;
}
assert(refused && creates === 1, "incomplete address does not start checkout");

let taxEnabled: boolean | null = null;
await createSubscriptionCheckoutSession(sessionInput, {
  listPrices: async (lookupKey) => [price(lookupKey)],
  store,
  stripeCustomers: { async createCustomer() { throw new Error("duplicate customer"); } },
  stripeCheckout: {
    async createSubscriptionCheckoutSession(input) {
      taxEnabled = input.automaticTax === true;
      return { id: "cs_off", url: "https://checkout.stripe.test/c/cs_off" };
    },
  },
});
assert(taxEnabled === false, "unauthorized checkout does not enable tax");

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const provider = read("lib/billing/stripe/provider.ts");
const sms = read("lib/billing/stripe/sms-purchase-tax.ts");
const cancellation = read("lib/billing/stripe/cancellation.ts");
const tax = read("lib/billing/stripe/subscription-tax.ts");
assert(provider.includes("subscriptionCheckoutAutomaticTaxFields"), "provider uses the subscription tax helper");
assert(!provider.includes("billing_address_collection"), "provider does not collect a second address");
assert(!provider.includes("customer_update"), "provider does not let checkout replace the address");
assert(!provider.includes("trial_period_days"), "stripe trial length is unchanged");
assert(!provider.includes("paymentIntents"), "no payment intent");
assert(sms.includes("STRIPE_SMS_TAX_COLLECTION"), "sms tax gate remains");
assert(!tax.includes("STRIPE_SMS_TAX_COLLECTION"), "subscription gate is independent");
assert(!cancellation.includes("automatic_tax"), "cancellation does not create a tax charge");
assert(!tax.includes("0.065") && !tax.includes("10.35"), "no hard-coded tax rate");
console.log("subscription tax self-check passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

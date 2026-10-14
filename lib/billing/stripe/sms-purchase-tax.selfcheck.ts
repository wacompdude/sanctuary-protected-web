/**
 * SMS purchase tax rules. No Stripe, database, or credit grants.
 */
import {
  interpretSmsPurchaseTaxCalculation,
  readSmsBillingAddress,
  smsCheckoutAutomaticTaxFields,
  smsPackagePriceAuthorizationHolds,
  smsPurchaseTaxCalculationParams,
  smsPurchaseTaxCollectionAuthorized,
  smsReplenishmentChargeFitsCap,
} from "@/lib/billing/stripe/sms-purchase-tax";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const address = {
  line1: "1 Main St",
  city: "Seattle",
  state: "WA",
  postalCode: "98101",
  country: "US" as const,
};

assert(smsPurchaseTaxCollectionAuthorized(undefined) === false, "collection defaults off");
assert(smsPurchaseTaxCollectionAuthorized("true") === false, "true is not authorization");
assert(smsPurchaseTaxCollectionAuthorized("authorized") === true, "explicit authorization");

assert(readSmsBillingAddress({}) === null, "empty address");
assert(readSmsBillingAddress({ country: "US", postal_code: "98101" }) === null, "partial address");
assert(readSmsBillingAddress({ country: "GB", line1: "1", city: "London", state: "L", postal_code: "SW1" }) === null, "outside initial countries");
assert(readSmsBillingAddress({
  country: "us",
  line1: address.line1,
  city: address.city,
  state: address.state,
  postal: address.postalCode,
})?.country === "US", "US address");

const zero = interpretSmsPurchaseTaxCalculation({
  packageSubtotalCents: 500,
  nowSeconds: 1_000,
  calculation: {
    id: "taxcalc_zero",
    currency: "usd",
    amountTotal: 500,
    taxAmountExclusive: 0,
    taxAmountInclusive: 0,
    expiresAt: 2_000,
  },
});
assert(zero.ok && zero.taxCents === 0 && zero.totalCents === 500, "zero tax");

const taxed = interpretSmsPurchaseTaxCalculation({
  packageSubtotalCents: 500,
  nowSeconds: 1_000,
  calculation: {
    id: "taxcalc_nonzero",
    currency: "usd",
    amountTotal: 543,
    taxAmountExclusive: 43,
    taxAmountInclusive: 0,
    expiresAt: 2_000,
  },
});
assert(taxed.ok && taxed.subtotalCents === 500 && taxed.taxCents === 43 && taxed.totalCents === 543, "nonzero tax");

assert(interpretSmsPurchaseTaxCalculation({
  packageSubtotalCents: 500,
  nowSeconds: 1_000,
  calculation: { id: "taxcalc_bad", currency: "usd", amountTotal: 500, taxAmountExclusive: 0, taxAmountInclusive: 0, expiresAt: 1_000 },
}).ok === false, "expired");
assert(interpretSmsPurchaseTaxCalculation({
  packageSubtotalCents: 500,
  nowSeconds: 1_000,
  calculation: { id: null, currency: "usd", amountTotal: 500, taxAmountExclusive: 0, taxAmountInclusive: 0, expiresAt: 2_000 },
}).ok === false, "missing calculation");
assert(interpretSmsPurchaseTaxCalculation({
  packageSubtotalCents: 500,
  nowSeconds: 1_000,
  calculation: { id: "taxcalc_inclusive", currency: "usd", amountTotal: 500, taxAmountExclusive: 0, taxAmountInclusive: 40, expiresAt: 2_000 },
}).ok === false, "inclusive tax");
assert(interpretSmsPurchaseTaxCalculation({
  packageSubtotalCents: 500,
  nowSeconds: 1_000,
  calculation: { id: "taxcalc_total", currency: "usd", amountTotal: 500, taxAmountExclusive: 40, taxAmountInclusive: 0, expiresAt: 2_000 },
}).ok === false, "total mismatch");

const params = smsPurchaseTaxCalculationParams({
  customerId: "cus_tax",
  subtotalCents: 500,
  address,
  productId: "prod_sms",
});
assert(params.currency === "usd", "currency");
assert(params.line_items[0].amount === 500, "subtotal");
assert(params.line_items[0].tax_behavior === "exclusive", "exclusive");
assert(!("tax_code" in params.line_items[0]), "tax code is not chosen here");
assert(params.customer_details.address_source === "billing", "billing address");
assert(smsCheckoutAutomaticTaxFields(false) === null, "checkout tax stays off");
const checkout = smsCheckoutAutomaticTaxFields(true);
assert(checkout?.automatic_tax.enabled === true, "checkout automatic tax");
assert(checkout?.billing_address_collection === "required", "checkout address");
assert(checkout?.customer_update.address === "auto", "customer address update");
assert(smsReplenishmentChargeFitsCap({ spentCents: 0, subtotalCents: 500, taxCents: 0, capCents: 500 }), "cap allows exact subtotal");
assert(!smsReplenishmentChargeFitsCap({ spentCents: 0, subtotalCents: 500, taxCents: 1, capCents: 500 }), "tax can exceed cap");
assert(smsPackagePriceAuthorizationHolds(500, 500), "same package price");
assert(smsPackagePriceAuthorizationHolds(1000, 500), "lower package price");
assert(!smsPackagePriceAuthorizationHolds(500, 1000), "higher package price");
assert(smsPackagePriceAuthorizationHolds(500, 500) && !smsReplenishmentChargeFitsCap({
  spentCents: 0,
  subtotalCents: 500,
  taxCents: 25,
  capCents: 500,
}), "tax change is not a package price change");

console.log("sms purchase tax self-check passed");

/**
 * Shared SMS purchase tax rules for Checkout and automatic replenishment.
 * This module does not call Stripe, grant credits, or decide nexus.
 */

export const SMS_PURCHASE_TAX_CODE_CANDIDATE = "txcd_10103001";
export const SMS_PURCHASE_TAX_COLLECTION_ENV = "STRIPE_SMS_TAX_COLLECTION";

const CALCULATION_ID = /^taxcalc_[A-Za-z0-9_]{1,248}$/;

export type SmsBillingAddress = {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US" | "CA";
};

export function smsPurchaseTaxCollectionAuthorized(
  envValue: string | undefined = process.env[SMS_PURCHASE_TAX_COLLECTION_ENV],
): boolean {
  return envValue === "authorized";
}

export function readSmsBillingAddress(value: unknown): SmsBillingAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const country = String(row.country ?? "").trim().toUpperCase();
  const line1 = String(row.line1 ?? "").trim();
  const city = String(row.city ?? "").trim();
  const state = String(row.state ?? "").trim();
  const postalCode = String(row.postal_code ?? row.postal ?? row.postalCode ?? "").trim();
  if (country !== "US" && country !== "CA") return null;
  if (!line1 || !city || !state || !postalCode) return null;
  if (line1.length > 200 || city.length > 100 || state.length > 100 || postalCode.length > 32) {
    return null;
  }
  return { line1, city, state, postalCode, country };
}

export function smsPurchaseTaxCalculationParams(input: {
  customerId: string;
  subtotalCents: number;
  address: SmsBillingAddress;
  productId?: string | null;
}) {
  if (!input.customerId.startsWith("cus_")) {
    throw new Error("SMS purchase tax calculation requires the organization customer.");
  }
  if (!Number.isInteger(input.subtotalCents) || input.subtotalCents <= 0) {
    throw new Error("SMS purchase tax calculation requires the package subtotal.");
  }
  const productId = input.productId?.trim() || null;
  return {
    currency: "usd" as const,
    customer: input.customerId,
    customer_details: {
      address: {
        line1: input.address.line1,
        city: input.address.city,
        state: input.address.state,
        postal_code: input.address.postalCode,
        country: input.address.country,
      },
      address_source: "billing" as const,
    },
    line_items: [
      {
        amount: input.subtotalCents,
        quantity: 1,
        tax_behavior: "exclusive" as const,
        reference: "application_sms_package",
        ...(productId ? { product: productId } : {}),
      },
    ],
  };
}

export type SmsPurchaseTaxCalculationResult = {
  id: string | null;
  currency: string | null;
  amountTotal: number | null;
  taxAmountExclusive: number | null;
  taxAmountInclusive: number | null;
  expiresAt: number | null;
};

export function interpretSmsPurchaseTaxCalculation(input: {
  calculation: SmsPurchaseTaxCalculationResult;
  packageSubtotalCents: number;
  nowSeconds: number;
}):
  | {
      ok: true;
      subtotalCents: number;
      taxCents: number;
      totalCents: number;
      calculationId: string;
      expiresAt: string;
    }
  | { ok: false; reason: string } {
  const id = input.calculation.id ?? "";
  if (!CALCULATION_ID.test(id)) return { ok: false, reason: "calculation_invalid" };
  if ((input.calculation.currency ?? "").toLowerCase() !== "usd") {
    return { ok: false, reason: "currency_invalid" };
  }
  const inclusive = input.calculation.taxAmountInclusive;
  const exclusive = input.calculation.taxAmountExclusive;
  const total = input.calculation.amountTotal;
  if (inclusive !== 0) return { ok: false, reason: "inclusive_tax_unsupported" };
  if (!Number.isInteger(exclusive) || exclusive == null || exclusive < 0) {
    return { ok: false, reason: "tax_invalid" };
  }
  if (!Number.isInteger(input.packageSubtotalCents) || input.packageSubtotalCents <= 0) {
    return { ok: false, reason: "subtotal_invalid" };
  }
  if (total !== input.packageSubtotalCents + exclusive) {
    return { ok: false, reason: "total_mismatch" };
  }
  const expiresAt = input.calculation.expiresAt;
  if (!Number.isInteger(expiresAt) || expiresAt == null || expiresAt <= input.nowSeconds) {
    return { ok: false, reason: "calculation_expired" };
  }
  return {
    ok: true,
    subtotalCents: input.packageSubtotalCents,
    taxCents: exclusive,
    totalCents: total,
    calculationId: id,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export function smsCheckoutAutomaticTaxFields(authorized: boolean) {
  if (!authorized) return null;
  return {
    automatic_tax: { enabled: true as const },
    billing_address_collection: "required" as const,
    customer_update: { address: "auto" as const },
  };
}

export function smsReplenishmentChargeFitsCap(input: {
  spentCents: number;
  subtotalCents: number;
  taxCents: number;
  capCents: number;
}): boolean {
  return (
    input.spentCents + input.subtotalCents + input.taxCents <= input.capCents
  );
}

export function smsPackagePriceAuthorizationHolds(
  authorizedPackagePriceCents: number,
  currentPackagePriceCents: number,
): boolean {
  return currentPackagePriceCents <= authorizedPackagePriceCents;
}

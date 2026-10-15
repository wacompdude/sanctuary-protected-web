/**
 * Subscription Stripe Tax rules. Stripe calculates tax. This module does not.
 * SMS tax remains independently gated and is not read here.
 */

import { BillingCheckoutPlanError } from "@/lib/billing/errors";

export const SUBSCRIPTION_TAX_COLLECTION_ENV = "STRIPE_SUBSCRIPTION_TAX_COLLECTION";

export const SUBSCRIPTION_TAX_ADDRESS_REQUIRED =
  "Add a complete billing address before starting subscription checkout.";

export const SUBSCRIPTION_TAX_SYNC_FAILED =
  "The billing address could not be synchronized for tax. Checkout was not started.";

export const SUBSCRIPTION_INVOICE_TAX_UNDETERMINED =
  "Subscription invoice tax could not be determined.";

export function subscriptionTaxCollectionAuthorized(
  envValue: string | undefined = process.env[SUBSCRIPTION_TAX_COLLECTION_ENV],
): boolean {
  return envValue === "authorized";
}

/** Checkout fields when subscription tax is deliberately authorized. No address collection. */
export function subscriptionCheckoutAutomaticTaxFields(authorized: boolean): {
  automatic_tax: { enabled: true };
} | null {
  if (!authorized) return null;
  return { automatic_tax: { enabled: true } };
}

export function assertSubscriptionTaxCheckoutReady(input: {
  authorized: boolean;
  billingAddressComplete: boolean;
}): void {
  if (input.authorized && !input.billingAddressComplete) {
    throw new BillingCheckoutPlanError(SUBSCRIPTION_TAX_ADDRESS_REQUIRED);
  }
}

export function subscriptionUpgradeAutomaticTax(authorized: boolean): {
  automatic_tax: { enabled: true };
} | null {
  if (!authorized) return null;
  return { automatic_tax: { enabled: true } };
}

export function subscriptionScheduleAutomaticTax(authorized: boolean): {
  default_settings: { automatic_tax: { enabled: true } };
} | null {
  if (!authorized) return null;
  return { default_settings: { automatic_tax: { enabled: true } } };
}

function money(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) return Number.NaN;
  return value;
}

/**
 * Split a Stripe invoice into subtotal, tax, and total.
 * Absent tax fields keep the historical single-amount record and are not treated as determined zero tax.
 * Inconsistent Stripe amounts fail closed instead of being stored as zero tax.
 */
export function interpretSubscriptionInvoiceMoney(input: {
  amountSubtotal?: number | null;
  amountTax?: number | null;
  amountTotal?: number | null;
  amountPaid?: number | null;
  amountDue?: number | null;
}): {
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  taxDetermined: boolean;
} {
  const paid = Math.max(0, input.amountPaid ?? input.amountDue ?? 0);
  const subtotal = money(input.amountSubtotal);
  const tax = money(input.amountTax);
  const total = money(input.amountTotal);
  if (Number.isNaN(subtotal) || Number.isNaN(tax) || Number.isNaN(total)) {
    throw new Error(SUBSCRIPTION_INVOICE_TAX_UNDETERMINED);
  }
  if (subtotal == null || tax == null) {
    return {
      totalCents: paid,
      subtotalCents: paid,
      taxCents: 0,
      taxDetermined: false,
    };
  }
  if (total != null && total !== subtotal + tax) {
    throw new Error(SUBSCRIPTION_INVOICE_TAX_UNDETERMINED);
  }
  return {
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: subtotal + tax,
    taxDetermined: true,
  };
}

export function formatSubscriptionInvoiceAmounts(input: {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxDetermined: boolean;
}): string {
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  if (!input.taxDetermined) return `Total ${usd(input.totalCents)}`;
  return `Subtotal ${usd(input.subtotalCents)} · Tax ${usd(input.taxCents)} · Total ${usd(input.totalCents)}`;
}

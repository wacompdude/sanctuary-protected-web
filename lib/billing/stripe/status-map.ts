/**
 * Stripe → Sanctuary Protected subscription / invoice status maps (Phase 4B-4).
 */

import type { ChurchSubscriptionStatus } from "@/lib/subscriptions/types";

export type BillingInvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible";

export type BillingPaymentStatus = "ok" | "failed" | "action_required" | "unknown";

/**
 * Map Stripe subscription.status → organization_subscriptions.status.
 * Unsupported values throw (do not silently coerce).
 */
export function mapStripeSubscriptionStatus(
  stripeStatus: string,
): ChurchSubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "unpaid":
      // Closest access-preserving delinquent state in existing enum.
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "expired";
    case "paused":
      return "suspended";
    default:
      throw new Error(
        `Unsupported Stripe subscription status "${stripeStatus.slice(0, 32)}".`,
      );
  }
}

export function mapStripeInvoiceStatus(stripeStatus: string): BillingInvoiceStatus {
  switch (stripeStatus) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "paid":
      return "paid";
    case "void":
      return "void";
    case "uncollectible":
      return "uncollectible";
    default:
      throw new Error(
        `Unsupported Stripe invoice status "${stripeStatus.slice(0, 32)}".`,
      );
  }
}

export function paymentStatusForInvoice(
  invoiceStatus: BillingInvoiceStatus,
): BillingPaymentStatus {
  if (invoiceStatus === "paid") return "ok";
  if (invoiceStatus === "open" || invoiceStatus === "uncollectible") {
    return "failed";
  }
  return "unknown";
}

/**
 * Base-subscription payment failure and recovery rules.
 * Stripe remains the retry authority. This module does not create payments.
 *
 * One invoice is one billing incident. Smart Retry failures reuse that
 * incident. A later invoice is a new incident. A paid invoice is not moved
 * back to failed by an older failure event.
 */

import {
  SUBSCRIPTION_CARD_EXPIRATION_CHANNELS,
  SUBSCRIPTION_CARD_EXPIRATION_ROLES,
} from "@/lib/billing/stripe/subscription-card-expiration";

export const SUBSCRIPTION_DUNNING_ROLES = SUBSCRIPTION_CARD_EXPIRATION_ROLES;
export const SUBSCRIPTION_DUNNING_CHANNELS = SUBSCRIPTION_CARD_EXPIRATION_CHANNELS;

const SUBSCRIPTION_BILLING_REASONS = new Set([
  "subscription_cycle",
  "subscription_create",
  "subscription_update",
  "subscription_threshold",
]);

export function isSubscriptionDunningRecipient(role: string | null): boolean {
  return role != null && (SUBSCRIPTION_DUNNING_ROLES as readonly string[]).includes(role);
}

export function isBaseSubscriptionDunningInvoice(input: {
  subscriptionId?: string | null;
  billingReason?: string | null;
  sanctuaryPurpose?: string | null;
  sanctuaryCheckout?: string | null;
  packageKey?: string | null;
  planResolved: boolean;
  planResolutionCode?: string | null;
}): boolean {
  if (!input.subscriptionId?.trim()) return false;
  if (input.sanctuaryCheckout === "sms_package") return false;
  if (input.packageKey?.trim()) return false;
  if (input.sanctuaryPurpose?.includes("sms")) return false;
  if (input.planResolutionCode === "sms") return false;
  if (input.planResolved) return true;
  return SUBSCRIPTION_BILLING_REASONS.has(input.billingReason ?? "");
}

export function formatStripeRetryDate(unixSeconds: number | null | undefined): string | null {
  if (unixSeconds == null || !Number.isInteger(unixSeconds) || unixSeconds <= 0) return null;
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatInvoiceAmount(
  cents: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (cents == null || !Number.isInteger(cents) || cents < 0) return null;
  const code = (currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
  }).format(cents / 100);
}

export function subscriptionFailureDedupKey(invoiceId: string): string {
  return `billing.subscription_payment_failed:${invoiceId}`;
}

export function subscriptionRecoveryDedupKey(invoiceId: string): string {
  return `billing.subscription_payment_recovered:${invoiceId}`;
}

export function subscriptionFinalFailureDedupKey(subscriptionId: string): string {
  return `billing.subscription_payment_final:${subscriptionId}`;
}

export function subscriptionPaymentFailureEffect(input: {
  existingStatus?: string | null;
  existingRecovered?: boolean;
}): { action: "ignore_stale" } | { action: "record" } {
  if (input.existingRecovered) return { action: "ignore_stale" };
  if (input.existingStatus === "paid" || input.existingStatus === "void") {
    return { action: "ignore_stale" };
  }
  return { action: "record" };
}

export function subscriptionPaymentWasPreviouslyFailed(input: {
  existingStatus?: string | null;
  existingFailure?: boolean;
  existingRecovered?: boolean;
}): boolean {
  return input.existingFailure === true && input.existingRecovered !== true && input.existingStatus !== "paid";
}

export function subscriptionPaymentRecoveryEffect(input: {
  existingFailure?: boolean;
  existingRecovered?: boolean;
}): { notify: boolean } {
  return { notify: input.existingFailure === true && input.existingRecovered !== true };
}

export function subscriptionFinalFailureEffect(input: {
  stripeStatus?: string | null;
  paymentStatus?: string | null;
}): { notify: boolean } {
  const stripeStatus = input.stripeStatus ?? "";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "active") {
    return { notify: false };
  }
  if (stripeStatus !== "canceled" && stripeStatus !== "cancelled") return { notify: false };
  return { notify: input.paymentStatus === "failed" };
}

export function subscriptionFailureNotice(input: {
  organizationName: string;
  amountDueCents?: number | null;
  currency?: string | null;
  nextPaymentAttemptUnix?: number | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
}): { title: string; body: string; notificationType: "billing.subscription_payment_failed" } {
  const organization = input.organizationName.trim() || "your organization";
  const amount = formatInvoiceAmount(input.amountDueCents, input.currency);
  const retry = formatStripeRetryDate(input.nextPaymentAttemptUnix);
  const card =
    input.cardBrand && input.cardLast4
      ? ` using ${input.cardBrand} ending in ${input.cardLast4}`
      : "";
  const amountSentence = amount ? ` Amount due: ${amount}.` : "";
  const retrySentence = retry
    ? ` Stripe is scheduled to retry the payment on ${retry}.`
    : " Stripe may automatically retry the payment according to the billing retry schedule.";
  return {
    notificationType: "billing.subscription_payment_failed",
    title: "Subscription payment failed",
    body: `We couldn't process the latest payment for the Sanctuary Protected subscription for ${organization}${card}.${amountSentence}${retrySentence} Please review your subscription payment method in Settings → Billing to help avoid interruption.`,
  };
}

export function subscriptionRecoveryNotice(input: {
  organizationName: string;
  amountPaidCents?: number | null;
  currency?: string | null;
}): { title: string; body: string; notificationType: "billing.subscription_payment_recovered" } {
  const organization = input.organizationName.trim() || "your organization";
  const amount = formatInvoiceAmount(input.amountPaidCents, input.currency);
  const amountSentence = amount ? ` Amount paid: ${amount}.` : "";
  return {
    notificationType: "billing.subscription_payment_recovered",
    title: "Subscription payment received",
    body: `Your Sanctuary Protected subscription payment for ${organization} has been processed successfully.${amountSentence} No further action is required for this billing issue.`,
  };
}

export function subscriptionFinalFailureNotice(input: {
  organizationName: string;
  stripeStatus?: string | null;
}): { title: string; body: string; notificationType: "billing.subscription_payment_final_failure" } | null {
  if (input.stripeStatus !== "canceled" && input.stripeStatus !== "cancelled") return null;
  const organization = input.organizationName.trim() || "your organization";
  return {
    notificationType: "billing.subscription_payment_final_failure",
    title: "Subscription canceled after unsuccessful payment",
    body: `Your Sanctuary Protected subscription for ${organization} was canceled after the outstanding subscription payment could not be completed. Update your payment method and review your billing options to restore paid service.`,
  };
}

export type SubscriptionPaymentAttention =
  | { show: false }
  | {
      show: true;
      title: string;
      body: string;
      retryLabel: string | null;
    };

export function subscriptionPaymentAttention(input: {
  invoiceStatus?: string | null;
  failure?: boolean;
  recovered?: boolean;
  nextPaymentAttemptUnix?: number | null;
  subscriptionStatus?: string | null;
}): SubscriptionPaymentAttention {
  if (!input.failure || input.recovered) return { show: false };
  if (input.invoiceStatus === "paid" || input.invoiceStatus === "void") return { show: false };
  if (input.invoiceStatus !== "open" && input.invoiceStatus !== "uncollectible") {
    return { show: false };
  }
  if (input.subscriptionStatus === "cancelled" || input.subscriptionStatus === "canceled") {
    return {
      show: true,
      title: "Subscription payment was not recovered",
      body: "The outstanding subscription payment was not completed before the subscription was canceled. Review billing to restore paid service.",
      retryLabel: null,
    };
  }
  const retry = formatStripeRetryDate(input.nextPaymentAttemptUnix);
  return {
    show: true,
    title: "Payment issue",
    body: input.subscriptionStatus === "past_due"
      ? "We couldn't process your latest subscription payment. The subscription is not canceled. Stripe may retry the payment automatically."
      : "We couldn't process your latest subscription payment. Stripe may retry the payment automatically.",
    retryLabel: retry ? `Next automatic payment attempt: ${retry}` : null,
  };
}

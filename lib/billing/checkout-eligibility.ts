/**
 * Initial subscription Checkout eligibility + display helpers.
 * Pure logic for Billing UI and server-side Checkout guards.
 */

import { BillingCheckoutPlanError } from "@/lib/billing/errors";

/**
 * True when the organization already has a connected provider subscription.
 * A Stripe Customer alone is NOT a subscription.
 */
export function organizationHasProviderSubscription(
  billingSubscriptionId: string | null | undefined,
): boolean {
  return Boolean(
    typeof billingSubscriptionId === "string" &&
      billingSubscriptionId.trim(),
  );
}

export type ConnectedPlanAction =
  | "initial_checkout"
  | "current"
  | "upgrade"
  | "downgrade_unavailable";

/**
 * A connected Stripe subscription never starts Checkout.
 * Higher plans use the dedicated upgrade path. Lower plans stay unavailable.
 */
export function connectedSubscriptionPlanAction(input: {
  hasProviderSubscription: boolean;
  isSamePlan: boolean;
  isUpgrade: boolean;
  isDowngrade: boolean;
}): ConnectedPlanAction {
  if (!input.hasProviderSubscription) return "initial_checkout";
  if (input.isSamePlan) return "current";
  if (input.isUpgrade) return "upgrade";
  if (input.isDowngrade) return "downgrade_unavailable";
  return "current";
}

/** A completed upgrade review is stale once the selected plan is already current. */
export function completedUpgradeReviewIsCurrent(input: {
  hasProviderSubscription: boolean;
  currentPlanKey: string | null;
  selectedPlanKey: string;
  impactSaysUpgrade: boolean;
}): boolean {
  return (
    input.hasProviderSubscription &&
    input.impactSaysUpgrade &&
    input.currentPlanKey != null &&
    input.currentPlanKey === input.selectedPlanKey
  );
}

/**
 * Whether the Billing UI may start initial subscription Checkout for the
 * selected plan. An existing provider subscription is never Checkout.
 */
export function canStartInitialSubscriptionCheckout(input: {
  isSamePlan: boolean;
  hasProviderSubscription: boolean;
  checkoutAvailable: boolean;
}): boolean {
  if (!input.checkoutAvailable) return false;
  if (input.hasProviderSubscription) return false;
  return true;
}

export function initialSamePlanCheckoutSummary(): string {
  return (
    "This is your current plan. No payment subscription is connected yet. " +
    "Continue to checkout to start billing for this plan."
  );
}

/**
 * Refuse a second initial subscription-mode Checkout once a provider
 * subscription id is already stored locally.
 */
export function assertNoExistingProviderSubscriptionForInitialCheckout(
  billingSubscriptionId: string | null | undefined,
): void {
  if (organizationHasProviderSubscription(billingSubscriptionId)) {
    throw new BillingCheckoutPlanError(
      "A payment subscription is already connected for this organization. " +
        "Initial Checkout cannot create another subscription.",
    );
  }
}

/**
 * Display-only currency formatting from integer cents.
 */
export function formatBillingPlanPrice(
  cents: number | null | undefined,
  currency = "USD",
): string {
  if (cents === null || cents === undefined) return "Contact us";
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return "Contact us";
  const code = (currency || "USD").toUpperCase();
  try {
    // en-US keeps commercial USD cards consistent ($29.95) across server locales.
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

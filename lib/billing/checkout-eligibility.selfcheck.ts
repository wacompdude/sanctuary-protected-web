/**
 * Initial Checkout eligibility + plan price display self-check.
 * Pure mocks only — no Stripe network / no DB writes.
 *
 * Run: npx --yes tsx lib/billing/checkout-eligibility.selfcheck.ts
 */

import { BillingCheckoutPlanError } from "@/lib/billing/errors";
import {
  assertNoExistingProviderSubscriptionForInitialCheckout,
  canStartInitialSubscriptionCheckout,
  connectedSubscriptionPlanAction,
  completedUpgradeReviewIsCurrent,
  formatBillingPlanPrice,
  initialSamePlanCheckoutSummary,
  organizationHasProviderSubscription,
} from "@/lib/billing/checkout-eligibility";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function main() {
  // Provider subscription detection
  assert(
    organizationHasProviderSubscription(null) === false,
    "null is not a provider subscription",
  );
  assert(
    organizationHasProviderSubscription("") === false,
    "empty string is not a provider subscription",
  );
  assert(
    organizationHasProviderSubscription("   ") === false,
    "whitespace is not a provider subscription",
  );
  assert(
    organizationHasProviderSubscription("sub_abc123") === true,
    "sub id is a provider subscription",
  );

  // Customer alone must not be treated as subscription — helper only accepts sub id
  assert(
    organizationHasProviderSubscription(undefined) === false,
    "undefined is not a provider subscription",
  );

  // UI: same plan, no provider sub, checkout available → permitted
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: true,
      hasProviderSubscription: false,
      checkoutAvailable: true,
    }) === true,
    "same plan without provider sub allows checkout",
  );

  // UI: same plan with provider sub → blocked
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: true,
      hasProviderSubscription: true,
      checkoutAvailable: true,
    }) === false,
    "same plan with provider sub blocks checkout",
  );

  // Presence of customer alone is not modeled here; hasProviderSubscription=false
  // even if a customer exists elsewhere must still allow checkout.
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: true,
      hasProviderSubscription: false,
      checkoutAvailable: true,
    }) === true,
    "customer alone does not block (hasProviderSubscription false)",
  );

  // Checkout unavailable → blocked even without provider sub
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: true,
      hasProviderSubscription: false,
      checkoutAvailable: false,
    }) === false,
    "checkout unavailable blocks",
  );

  // Different plan upgrade still permitted when checkout available
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: false,
      hasProviderSubscription: false,
      checkoutAvailable: true,
    }) === true,
    "different plan without provider sub allowed",
  );
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: false,
      hasProviderSubscription: true,
      checkoutAvailable: true,
    }) === false,
    "existing subscription never starts initial checkout, including upgrades",
  );
  assert(
    connectedSubscriptionPlanAction({
      hasProviderSubscription: true,
      isSamePlan: false,
      isUpgrade: true,
      isDowngrade: false,
    }) === "upgrade",
    "higher plan on a connected subscription uses upgrade",
  );
  assert(
    connectedSubscriptionPlanAction({
      hasProviderSubscription: true,
      isSamePlan: true,
      isUpgrade: false,
      isDowngrade: false,
    }) === "current",
    "current connected plan does not start checkout",
  );
  assert(
    connectedSubscriptionPlanAction({
      hasProviderSubscription: true,
      isSamePlan: false,
      isUpgrade: false,
      isDowngrade: true,
    }) === "schedule_downgrade",
    "lower plan schedules a renewal downgrade and is not checkout or an immediate upgrade",
  );
  assert(
    completedUpgradeReviewIsCurrent({
      hasProviderSubscription: true,
      currentPlanKey: "steward_pro",
      selectedPlanKey: "steward_pro",
      impactSaysUpgrade: true,
    }) === true,
    "completed upgrade review is current once the target is the live plan",
  );
  assert(
    completedUpgradeReviewIsCurrent({
      hasProviderSubscription: true,
      currentPlanKey: "servant_standard",
      selectedPlanKey: "steward_pro",
      impactSaysUpgrade: true,
    }) === false,
    "upgrade review remains while the target is still higher",
  );

  // Server guard
  assertNoExistingProviderSubscriptionForInitialCheckout(null);
  assertNoExistingProviderSubscriptionForInitialCheckout(undefined);
  assertNoExistingProviderSubscriptionForInitialCheckout("");

  let rejected = false;
  try {
    assertNoExistingProviderSubscriptionForInitialCheckout("sub_existing");
  } catch (error) {
    rejected = error instanceof BillingCheckoutPlanError;
  }
  assert(rejected, "server rejects when provider subscription exists");

  // Copy for establishing billing on current plan
  assert(
    initialSamePlanCheckoutSummary().includes("No payment subscription"),
    "same-plan unpaid summary mentions no payment subscription",
  );
  assert(
    !initialSamePlanCheckoutSummary().toLowerCase().includes("unpaid"),
    "summary does not broadly claim unpaid",
  );

  // Price display — integer cents → USD with two decimals
  assert(formatBillingPlanPrice(2995, "USD") === "$29.95", "2995 → $29.95");
  assert(formatBillingPlanPrice(3995, "USD") === "$39.95", "3995 → $39.95");
  assert(formatBillingPlanPrice(5995, "USD") === "$59.95", "5995 → $59.95");
  assert(formatBillingPlanPrice(15000, "USD") === "$150.00", "15000 → $150.00");
  assert(formatBillingPlanPrice(null) === "Contact us", "null price");

  // Downgrade confirmation remains a separate UI concern (isSamePlan false path).
  // Eligibility must not force-enable same-plan when provider sub exists.
  assert(
    canStartInitialSubscriptionCheckout({
      isSamePlan: true,
      hasProviderSubscription: true,
      checkoutAvailable: true,
    }) === false,
    "downgrade-unrelated: same-plan+provider still blocked",
  );

  console.log("billing checkout eligibility self-check passed");
}

main();

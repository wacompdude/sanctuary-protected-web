/**
 * Stripe Live/Test billing-state isolation helpers.
 * Production paid authority requires provider_mode === "live".
 * Local no-card trials remain mode-NULL without a Stripe subscription id.
 */

import { EXPECTED_STRIPE_ACCOUNT_ID } from "@/lib/billing/stripe/connectivity-probe";

export type ProviderMode = "live" | "test";

export const PROVIDER_MODE_LIVE: ProviderMode = "live";
export const PROVIDER_MODE_TEST: ProviderMode = "test";

export function normalizeProviderMode(
  value: unknown,
): ProviderMode | null {
  if (value === "live" || value === "test") return value;
  return null;
}

export function providerModeFromLivemode(
  livemode: boolean | null | undefined,
): ProviderMode | null {
  if (livemode === true) return PROVIDER_MODE_LIVE;
  if (livemode === false) return PROVIDER_MODE_TEST;
  return null;
}

/**
 * Stripe direct-account webhooks often omit event.account.
 * NULL/empty is accepted for the platform account; a concrete acct_ must match.
 */
export function isExpectedStripeAccountId(
  accountId: string | null | undefined,
  expected: string = EXPECTED_STRIPE_ACCOUNT_ID,
): boolean {
  const id = (accountId ?? "").trim();
  if (!id) return true;
  return id === expected;
}

export function isAuthoritativeLiveStripeMode(
  providerMode: string | null | undefined,
): boolean {
  return normalizeProviderMode(providerMode) === PROVIDER_MODE_LIVE;
}

/**
 * Narrow local no-card trial: trialing, no Stripe subscription id, mode NULL.
 * Does not admit NULL-mode rows that still carry a Stripe subscription id.
 */
export function isLocalNoCardTrialSubscription(input: {
  status?: string | null;
  billingProvider?: string | null;
  billingSubscriptionId?: string | null;
  providerMode?: string | null;
}): boolean {
  if ((input.status ?? "").trim() !== "trialing") return false;
  if ((input.billingSubscriptionId ?? "").trim()) return false;
  if (normalizeProviderMode(input.providerMode) != null) return false;
  return true;
}

/**
 * Production paid Stripe authority OR narrow local trial.
 * Test and UNKNOWN Stripe-backed rows fail closed.
 */
export function isProductionSubscriptionAuthority(input: {
  status?: string | null;
  billingProvider?: string | null;
  billingSubscriptionId?: string | null;
  providerMode?: string | null;
}): boolean {
  if (isLocalNoCardTrialSubscription(input)) return true;
  const provider = (input.billingProvider ?? "").trim().toLowerCase();
  if (provider && provider !== "stripe") return false;
  if ((input.billingSubscriptionId ?? "").trim()) {
    return isAuthoritativeLiveStripeMode(input.providerMode);
  }
  // Stripe-less non-trial rows are not paid authority.
  return false;
}

export type StripeWebhookAuthorityDecision =
  | { ok: true; providerMode: ProviderMode; stripeAccountId: string | null }
  | {
      ok: false;
      reason: "test_or_wrong_account_event";
      providerMode: ProviderMode | null;
      stripeAccountId: string | null;
      detail: string;
    };

export function evaluateStripeWebhookAuthority(input: {
  livemode: boolean | null | undefined;
  stripeAccountId?: string | null;
  expectedAccountId?: string;
}): StripeWebhookAuthorityDecision {
  const accountId =
    typeof input.stripeAccountId === "string" && input.stripeAccountId.trim()
      ? input.stripeAccountId.trim()
      : null;
  const providerMode = providerModeFromLivemode(input.livemode);

  if (input.livemode !== true) {
    return {
      ok: false,
      reason: "test_or_wrong_account_event",
      providerMode: providerMode ?? PROVIDER_MODE_TEST,
      stripeAccountId: accountId,
      detail: "Stripe Test/Sandbox event ignored for Production billing authority.",
    };
  }

  if (
    !isExpectedStripeAccountId(
      accountId,
      input.expectedAccountId ?? EXPECTED_STRIPE_ACCOUNT_ID,
    )
  ) {
    return {
      ok: false,
      reason: "test_or_wrong_account_event",
      providerMode: PROVIDER_MODE_LIVE,
      stripeAccountId: accountId,
      detail: "Stripe account mismatch ignored for Production billing authority.",
    };
  }

  return {
    ok: true,
    providerMode: PROVIDER_MODE_LIVE,
    stripeAccountId: accountId ?? EXPECTED_STRIPE_ACCOUNT_ID,
  };
}

export const NON_LIVE_SUBSCRIPTION_MUTATION_MESSAGE =
  "This subscription is not a verified Live Stripe subscription. Billing changes are unavailable until it is reconciled.";

/**
 * Live Stripe mutations (upgrade, downgrade/schedule, cancellation) require the
 * local subscription row to be an authoritative Live Stripe row:
 * provider_mode === "live" with a Stripe subscription id.
 * Test rows and unclassified (NULL) Stripe-backed rows fail closed.
 * Local no-card trials never reach Stripe mutation paths.
 */
export function assertAuthoritativeLiveSubscription(
  row: {
    billingProvider?: string | null;
    billingSubscriptionId?: string | null;
    providerMode?: string | null;
  },
  makeError: (message: string) => Error = (message) => new Error(message),
): void {
  const provider = (row.billingProvider ?? "").trim().toLowerCase();
  const subscriptionId = (row.billingSubscriptionId ?? "").trim();
  if (provider !== "stripe" || !subscriptionId) {
    throw makeError(NON_LIVE_SUBSCRIPTION_MUTATION_MESSAGE);
  }
  if (!isAuthoritativeLiveStripeMode(row.providerMode)) {
    throw makeError(NON_LIVE_SUBSCRIPTION_MUTATION_MESSAGE);
  }
}

/**
 * Stripe API objects expose `livemode`. When present it must be true for any
 * Production mutation; false is rejected. Undefined/null (absent) is tolerated
 * only when the caller says the field is unavailable.
 */
export function assertStripeObjectLivemode(
  livemode: boolean | null | undefined,
  makeError: (message: string) => Error = (message) => new Error(message),
  options: { requirePresent?: boolean } = {},
): void {
  if (livemode === false) {
    throw makeError(NON_LIVE_SUBSCRIPTION_MUTATION_MESSAGE);
  }
  if (livemode == null && options.requirePresent) {
    throw makeError(NON_LIVE_SUBSCRIPTION_MUTATION_MESSAGE);
  }
}

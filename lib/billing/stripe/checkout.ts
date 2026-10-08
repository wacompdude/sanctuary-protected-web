/**
 * Initial subscription Checkout Session creation (Phase 4B-3).
 *
 * Trusted path only:
 *   internal plan key → commercial catalog → lookup key → verified Price
 *   → Stripe Customer (mapped) → Checkout Session (subscription mode)
 *
 * Injectable seams for self-checks. Live Stripe wiring lives in provider.
 * Checkout success redirects are NON-AUTHORITATIVE for entitlements.
 */

import { commercialExpectationByInternalKey } from "@/lib/billing/commercial-catalog";
import {
  BillingCheckoutPlanError,
  BillingConfigurationError,
} from "@/lib/billing/errors";
import { isPlanKey, type PlanKey } from "@/lib/subscriptions/plan-keys";
import {
  assertSafeBillingCheckoutUrls,
} from "@/lib/billing/stripe/checkout-urls";
import {
  ensureStripeCustomerForOrganization,
  type BillingCustomerMappingStore,
  type StripeCustomerCreateApi,
} from "@/lib/billing/stripe/customers";
import {
  resolveStripePriceByInternalKey,
  type ListPricesByLookupKey,
  type ResolvedStripePrice,
} from "@/lib/billing/stripe/catalog";
import { assertSandboxCatalogValidationMode } from "@/lib/billing/stripe/catalog";
import { withStripeBillingErrorLog } from "@/lib/billing/stripe/safe-error-log";
import type { BillingCheckoutSession } from "@/lib/billing/types";

export type StripeCheckoutSessionCreateApi = {
  createSubscriptionCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    organizationId: string;
    planKey: PlanKey;
    idempotencyKey: string;
    allowPromotionCodes: boolean;
  }): Promise<{ id: string; url: string | null }>;
};

export type CreateSubscriptionCheckoutInput = {
  organizationId: string;
  planKey: string;
  origin: string;
  successUrl: string;
  cancelUrl: string;
  fallbackEmail?: string | null;
  /** Server-generated attempt token (never accept from browser). */
  attemptToken: string;
  stripeSecretKey: string;
};

export type CreateSubscriptionCheckoutDeps = {
  listPrices: ListPricesByLookupKey;
  store: BillingCustomerMappingStore;
  stripeCustomers: StripeCustomerCreateApi;
  stripeCheckout: StripeCheckoutSessionCreateApi;
};

/**
 * Reject SMS packages and unknown keys for subscription Checkout.
 */
export function assertSubscriptionCheckoutPlanKey(planKey: string): PlanKey {
  const raw = planKey.trim();
  if (!raw) {
    throw new BillingCheckoutPlanError("Select a subscription plan.");
  }
  if (raw.startsWith("sms_block_") || raw.includes("_sms_")) {
    throw new BillingCheckoutPlanError(
      "SMS credit packages cannot be purchased through subscription Checkout.",
    );
  }
  if (!isPlanKey(raw)) {
    throw new BillingCheckoutPlanError(
      `Plan "${raw.slice(0, 64)}" is not an approved subscription plan.`,
    );
  }
  const expectation = commercialExpectationByInternalKey(raw);
  if (!expectation || expectation.kind !== "subscription") {
    throw new BillingCheckoutPlanError(
      "Only approved monthly subscription plans can start Checkout.",
    );
  }
  return raw;
}

/** Reject browser-supplied Stripe Price/Product/amount manipulation fields. */
export function assertNoClientPriceOverrides(input: {
  priceId?: string | null;
  productId?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  lookupKey?: string | null;
}): void {
  if (input.priceId) {
    throw new BillingCheckoutPlanError(
      "Browser-supplied Stripe Price IDs are not accepted.",
    );
  }
  if (input.productId) {
    throw new BillingCheckoutPlanError(
      "Browser-supplied Stripe Product IDs are not accepted.",
    );
  }
  if (input.amount !== undefined && input.amount !== null && input.amount !== "") {
    throw new BillingCheckoutPlanError(
      "Browser-supplied amounts are not accepted.",
    );
  }
  if (input.currency) {
    throw new BillingCheckoutPlanError(
      "Browser-supplied currency is not accepted.",
    );
  }
  if (input.lookupKey) {
    throw new BillingCheckoutPlanError(
      "Browser-supplied lookup keys are not accepted.",
    );
  }
}

export function stripeCheckoutIdempotencyKey(input: {
  organizationId: string;
  planKey: PlanKey;
  attemptToken: string;
}): string {
  const token = input.attemptToken.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (!token) {
    throw new BillingConfigurationError("Checkout attempt token is required.");
  }
  return `sp_cs_${input.organizationId}_${input.planKey}_${token}`;
}

function assertResolvedSubscriptionPrice(price: ResolvedStripePrice): void {
  if (price.kind !== "subscription") {
    throw new BillingCheckoutPlanError(
      "Resolved Stripe Price is not a subscription plan Price.",
    );
  }
  if (!price.active) {
    throw new BillingCheckoutPlanError("Resolved Stripe Price is inactive.");
  }
  if (price.currency !== "usd") {
    throw new BillingCheckoutPlanError("Resolved Stripe Price must be USD.");
  }
  if (price.priceType !== "recurring" || price.recurringInterval !== "month") {
    throw new BillingCheckoutPlanError(
      "Resolved Stripe Price must be a monthly recurring subscription.",
    );
  }
}

/**
 * Create a Stripe-hosted subscription Checkout Session.
 * Does NOT activate entitlements — webhooks are authoritative later.
 */
export async function createSubscriptionCheckoutSession(
  input: CreateSubscriptionCheckoutInput,
  deps: CreateSubscriptionCheckoutDeps,
): Promise<BillingCheckoutSession & { providerCustomerId: string; planKey: PlanKey }> {
  assertSandboxCatalogValidationMode(
    input.stripeSecretKey,
    "Phase 4B-3 Checkout",
  );

  const planKey = assertSubscriptionCheckoutPlanKey(input.planKey);
  assertSafeBillingCheckoutUrls({
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    expectedOrigin: input.origin,
  });

  const resolved = await withStripeBillingErrorLog(
    "catalog_price_resolution",
    () =>
      resolveStripePriceByInternalKey(planKey, {
        listPrices: deps.listPrices,
      }),
  );
  assertResolvedSubscriptionPrice(resolved);

  const customer = await withStripeBillingErrorLog("customer_ensure", () =>
    ensureStripeCustomerForOrganization({
      organizationId: input.organizationId,
      fallbackEmail: input.fallbackEmail,
      store: deps.store,
      stripeCustomers: deps.stripeCustomers,
    }),
  );

  const session = await withStripeBillingErrorLog(
    "checkout_session_create",
    () =>
      deps.stripeCheckout.createSubscriptionCheckoutSession({
        customerId: customer.providerCustomerId,
        priceId: resolved.stripePriceId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        organizationId: input.organizationId,
        planKey,
        idempotencyKey: stripeCheckoutIdempotencyKey({
          organizationId: input.organizationId,
          planKey,
          attemptToken: input.attemptToken,
        }),
        allowPromotionCodes: true,
      }),
  );

  if (!session.url) {
    throw new BillingConfigurationError(
      "Stripe Checkout Session did not return a redirect URL.",
    );
  }

  return {
    provider: "stripe",
    sessionId: session.id,
    url: session.url,
    providerCustomerId: customer.providerCustomerId,
    planKey,
  };
}

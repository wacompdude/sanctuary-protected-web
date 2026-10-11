/**
 * One-time SMS package Checkout.
 * Does not grant credits. Webhook confirmation is a later phase.
 * Injectable seams keep self-checks off the Stripe network.
 */

import {
  smsPackageForPlan,
  type CommercialPlanCatalogEntry,
} from "@/lib/billing/commercial-catalog";
import {
  BillingCheckoutPlanError,
  BillingConfigurationError,
} from "@/lib/billing/errors";
import { assertNoClientPriceOverrides } from "@/lib/billing/stripe/checkout";
import { assertSafeBillingCheckoutUrls } from "@/lib/billing/stripe/checkout-urls";
import {
  assertSandboxCatalogValidationMode,
  resolveStripePriceByInternalKey,
  type ListPricesByLookupKey,
  type ResolvedStripePrice,
} from "@/lib/billing/stripe/catalog";
import {
  ensureStripeCustomerForOrganization,
  type BillingCustomerMappingStore,
  type StripeCustomerCreateApi,
} from "@/lib/billing/stripe/customers";
import { withStripeBillingErrorLog } from "@/lib/billing/stripe/safe-error-log";
import { subscriptionGrantsAccess } from "@/lib/subscriptions/status";
import type { PlanKey } from "@/lib/subscriptions/plan-keys";

/**
 * Immediate card Checkout for this Stripe API.
 * Apple Pay and Google Pay are card wallets, not separate allowed payment
 * method types. Delayed methods such as bank debit are omitted.
 */
export const SMS_PACKAGE_ALLOWED_PAYMENT_METHOD_TYPES = ["card"] as const;

export type SmsPackageCheckoutMetadata = {
  sanctuary_checkout: "sms_package";
  organization_id: string;
  plan_key: PlanKey;
  package_key: string;
  lookup_key: string;
  sms_segments: string;
};

export type CreateSmsPackageCheckoutInput = {
  organizationId: string;
  subscriptionStatus: string | null | undefined;
  planKey: string | null | undefined;
  origin: string;
  successUrl: string;
  cancelUrl: string;
  fallbackEmail?: string | null;
  /** Server-generated attempt token. Never accept one from the browser. */
  attemptToken: string;
  stripeSecretKey: string;
};

export type StripeSmsCheckoutSessionCreateApi = {
  createSmsPackageCheckoutSession(input: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    organizationId: string;
    quantity: 1;
    allowedPaymentMethodTypes: readonly ["card"];
    metadata: SmsPackageCheckoutMetadata;
    idempotencyKey: string;
  }): Promise<{ id: string; url: string | null }>;
};

export type CreateSmsPackageCheckoutDeps = {
  listPrices: ListPricesByLookupKey;
  store: BillingCustomerMappingStore;
  stripeCustomers: StripeCustomerCreateApi;
  stripeCheckout: StripeSmsCheckoutSessionCreateApi;
};

export function assertNoSmsCheckoutClientOverrides(input: {
  priceId?: string | null;
  productId?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  lookupKey?: string | null;
  planKey?: string | null;
  segments?: number | string | null;
}): void {
  assertNoClientPriceOverrides(input);
  if (input.planKey) {
    throw new BillingCheckoutPlanError(
      "Browser-supplied plan keys are not accepted for SMS purchases.",
    );
  }
  if (
    input.segments !== undefined &&
    input.segments !== null &&
    input.segments !== ""
  ) {
    throw new BillingCheckoutPlanError(
      "Browser-supplied SMS quantities are not accepted.",
    );
  }
}

export function resolveTrustedSmsPackage(input: {
  subscriptionStatus: string | null | undefined;
  planKey: string | null | undefined;
}): CommercialPlanCatalogEntry {
  if (!input.subscriptionStatus || !subscriptionGrantsAccess(input.subscriptionStatus)) {
    throw new BillingCheckoutPlanError(
      "An active subscription is required before purchasing SMS credits.",
    );
  }
  const entry = smsPackageForPlan((input.planKey ?? "").trim());
  if (!entry) {
    throw new BillingCheckoutPlanError(
      "The current subscription does not have an SMS credit package.",
    );
  }
  return entry;
}

export function smsPackageCheckoutMetadata(
  organizationId: string,
  entry: CommercialPlanCatalogEntry,
): SmsPackageCheckoutMetadata {
  return {
    sanctuary_checkout: "sms_package",
    organization_id: organizationId,
    plan_key: entry.planKey,
    package_key: entry.smsExtraItemKey,
    lookup_key: entry.smsPackageLookupKey,
    sms_segments: String(entry.smsPackageCredits),
  };
}

export function stripeSmsCheckoutIdempotencyKey(input: {
  organizationId: string;
  packageKey: string;
  attemptToken: string;
}): string {
  const token = input.attemptToken.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (!token) {
    throw new BillingConfigurationError("Checkout attempt token is required.");
  }
  return `sp_sms_cs_${input.organizationId}_${input.packageKey}_${token}`;
}

function assertResolvedSmsPackagePrice(
  price: ResolvedStripePrice,
  entry: CommercialPlanCatalogEntry,
): void {
  if (price.kind !== "sms_package" || price.internalKey !== entry.smsExtraItemKey) {
    throw new BillingCheckoutPlanError(
      "Resolved Stripe Price is not this plan's SMS package.",
    );
  }
  if (!price.active) {
    throw new BillingCheckoutPlanError("Resolved Stripe Price is inactive.");
  }
  if (price.currency !== "usd") {
    throw new BillingCheckoutPlanError("Resolved Stripe Price must be USD.");
  }
  if (price.priceType !== "one_time" || price.recurringInterval) {
    throw new BillingCheckoutPlanError(
      "Resolved Stripe Price must be a one-time SMS package.",
    );
  }
  if (price.lookupKey !== entry.smsPackageLookupKey) {
    throw new BillingCheckoutPlanError(
      "Resolved Stripe Price lookup key does not match the catalog package.",
    );
  }
  if (
    price.unitAmountCents !== entry.smsPackagePriceCents ||
    price.smsCredits !== entry.smsPackageCredits
  ) {
    throw new BillingCheckoutPlanError(
      "Resolved Stripe Price does not match the catalog package amount.",
    );
  }
}

export async function createSmsPackageCheckoutSession(
  input: CreateSmsPackageCheckoutInput,
  deps: CreateSmsPackageCheckoutDeps,
): Promise<{
  sessionId: string;
  url: string;
  providerCustomerId: string;
  metadata: SmsPackageCheckoutMetadata;
}> {
  assertSandboxCatalogValidationMode(input.stripeSecretKey, "SMS package Checkout");
  const entry = resolveTrustedSmsPackage({
    subscriptionStatus: input.subscriptionStatus,
    planKey: input.planKey,
  });
  assertSafeBillingCheckoutUrls({
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    expectedOrigin: input.origin,
  });

  const resolved = await withStripeBillingErrorLog(
    "catalog_price_resolution",
    () =>
      resolveStripePriceByInternalKey(entry.smsExtraItemKey, {
        listPrices: deps.listPrices,
      }),
  );
  assertResolvedSmsPackagePrice(resolved, entry);

  const customer = await withStripeBillingErrorLog("customer_ensure", () =>
    ensureStripeCustomerForOrganization({
      organizationId: input.organizationId,
      fallbackEmail: input.fallbackEmail,
      store: deps.store,
      stripeCustomers: deps.stripeCustomers,
    }),
  );

  const metadata = smsPackageCheckoutMetadata(input.organizationId, entry);
  const session = await withStripeBillingErrorLog(
    "checkout_session_create",
    () =>
      deps.stripeCheckout.createSmsPackageCheckoutSession({
        customerId: customer.providerCustomerId,
        priceId: resolved.stripePriceId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        organizationId: input.organizationId,
        quantity: 1,
        allowedPaymentMethodTypes: SMS_PACKAGE_ALLOWED_PAYMENT_METHOD_TYPES,
        metadata,
        idempotencyKey: stripeSmsCheckoutIdempotencyKey({
          organizationId: input.organizationId,
          packageKey: entry.smsExtraItemKey,
          attemptToken: input.attemptToken,
        }),
      }),
  );

  if (!session.url) {
    throw new BillingConfigurationError(
      "Stripe Checkout Session did not return a redirect URL.",
    );
  }

  return {
    sessionId: session.id,
    url: session.url,
    providerCustomerId: customer.providerCustomerId,
    metadata,
  };
}

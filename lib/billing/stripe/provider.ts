/**
 * Stripe billing provider adapter.
 *
 * Phase 4B-4: signed webhooks + subscription/invoice sync foundation.
 * Customer Portal remains disabled. Checkout success redirects are
 * NON-AUTHORITATIVE for entitlements — verified webhooks are.
 */

import { randomUUID } from "node:crypto";
import { BillingCheckoutPlanError, BillingNotImplementedError } from "@/lib/billing/errors";
import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import {
  getStripeBillingConfigStatus,
  isStripeSecretConfigured,
  isStripeWebhookSecretConfigured,
  readStripeSecretKey,
  readStripeWebhookSecret,
  requireStripeSecretKey,
} from "@/lib/billing/stripe/config";
import { createStripeCatalogPriceLister } from "@/lib/billing/stripe/catalog-stripe";
import {
  assertNoClientPriceOverrides,
  createSubscriptionCheckoutSession,
} from "@/lib/billing/stripe/checkout";
import {
  resolveAppOrigin,
  buildBillingCheckoutUrls,
  assertSafeBillingCheckoutUrls,
} from "@/lib/billing/stripe/checkout-urls";
import {
  createAdminBillingCustomerStore,
} from "@/lib/billing/stripe/customers";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import {
  readOrganizationBillingAddress,
  stripeCustomerAddressUpdate,
} from "@/lib/billing/organization-billing-address";
import { createAdminClient } from "@/lib/supabase/admin";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import {
  SUBSCRIPTION_TAX_ADDRESS_REQUIRED,
  subscriptionCheckoutAutomaticTaxFields,
  subscriptionTaxCollectionAuthorized,
} from "@/lib/billing/stripe/subscription-tax";
import { verifyStripeWebhookSignature } from "@/lib/billing/stripe/webhook-verify";
import type {
  BillingCheckoutRequest,
  BillingCheckoutSession,
  BillingPortalRequest,
  BillingPortalSession,
  BillingProvider,
} from "@/lib/billing/types";

export class StripeBillingProvider implements BillingProvider {
  id = "stripe" as const;
  displayName = "Stripe";

  isConfigured(): boolean {
    return isStripeSecretConfigured(readStripeSecretKey());
  }

  capabilities() {
    return {
      checkout: this.isConfigured(),
      customerPortal: false,
      // Webhooks capability requires the signing secret — code alone is not enough.
      webhooks: isStripeWebhookSecretConfigured(readStripeWebhookSecret()),
      cancelAtProvider: false,
    };
  }

  getConfigStatus() {
    return getStripeBillingConfigStatus();
  }

  getCommercialCatalog() {
    return COMMERCIAL_PLAN_CATALOG;
  }

  async createCheckoutSession(
    request: BillingCheckoutRequest,
  ): Promise<BillingCheckoutSession> {
    const secretKey = requireStripeSecretKey(readStripeSecretKey());

    // Explicitly reject any accidental client price overrides if present on request bag.
    assertNoClientPriceOverrides({
      priceId: (request as { priceId?: string }).priceId,
      productId: (request as { productId?: string }).productId,
      amount: (request as { amount?: number }).amount,
      currency: (request as { currency?: string }).currency,
      lookupKey: (request as { lookupKey?: string }).lookupKey,
    });

    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
      ? resolveAppOrigin({ appUrl: process.env.NEXT_PUBLIC_APP_URL })
      : null;
    const ownedFallbackOrigin =
      configuredOrigin ?? "http://localhost:3000";
    const owned = buildBillingCheckoutUrls(ownedFallbackOrigin);
    const successUrl = request.successUrl?.trim() || owned.successUrl;
    const cancelUrl = request.cancelUrl?.trim() || owned.cancelUrl;
    const origin =
      configuredOrigin ?? new URL(successUrl).origin;
    assertSafeBillingCheckoutUrls({
      successUrl,
      cancelUrl,
      expectedOrigin: origin,
    });

    const stripe = getStripeClient(secretKey);
    const store = createAdminBillingCustomerStore();
    const listPrices = createStripeCatalogPriceLister(secretKey);
    const subscriptionTaxAuthorized = subscriptionTaxCollectionAuthorized();
    let billingAddressComplete = false;
    let canonicalAddress: ReturnType<typeof readOrganizationBillingAddress> = null;
    if (subscriptionTaxAuthorized) {
      const admin = createAdminClient();
      const { data: profile, error } = await admin
        .from("organization_billing_profiles")
        .select("billing_address")
        .eq("organization_id", request.organizationId)
        .eq("billing_provider", "stripe")
        .maybeSingle();
      canonicalAddress = error
        ? null
        : readOrganizationBillingAddress(profile?.billing_address);
      billingAddressComplete = canonicalAddress !== null;
      if (!billingAddressComplete) {
        throw new BillingCheckoutPlanError(SUBSCRIPTION_TAX_ADDRESS_REQUIRED);
      }
    }

    const result = await createSubscriptionCheckoutSession(
      {
        organizationId: request.organizationId,
        planKey: String(request.planKey),
        origin,
        successUrl,
        cancelUrl,
        fallbackEmail: request.customerEmail,
        attemptToken: randomUUID(),
        stripeSecretKey: secretKey,
        subscriptionTaxAuthorized,
        billingAddressComplete,
      },
      {
        listPrices,
        store,
        stripeCustomers: {
          async createCustomer(input) {
            const customer = await stripe.customers.create(
              {
                email: input.email || undefined,
                name: input.name || undefined,
                metadata: input.metadata,
              },
              { idempotencyKey: input.idempotencyKey },
            );
            return { id: customer.id };
          },
        },
        stripeCheckout: {
          async createSubscriptionCheckoutSession(input) {
            const taxFields = subscriptionCheckoutAutomaticTaxFields(
              input.automaticTax === true,
            );
            const session = await stripe.checkout.sessions.create(
              {
                mode: "subscription",
                customer: input.customerId,
                line_items: [{ price: input.priceId, quantity: 1 }],
                success_url: input.successUrl,
                cancel_url: input.cancelUrl,
                allow_promotion_codes: input.allowPromotionCodes,
                client_reference_id: input.organizationId,
                metadata: {
                  organization_id: input.organizationId,
                  plan_key: input.planKey,
                  sanctuary_checkout: "subscription_initial",
                },
                subscription_data: {
                  metadata: {
                    organization_id: input.organizationId,
                    plan_key: input.planKey,
                  },
                },
                ...(taxFields ?? {}),
              },
              { idempotencyKey: input.idempotencyKey },
            );
            return { id: session.id, url: session.url };
          },
        },
        syncCustomerAddress: async (customerId) => {
          if (!canonicalAddress) {
            throw new BillingCheckoutPlanError(SUBSCRIPTION_TAX_ADDRESS_REQUIRED);
          }
          try {
            await stripe.customers.update(
              customerId,
              stripeCustomerAddressUpdate(canonicalAddress),
            );
          } catch (stripeError) {
            logStripeBillingError("billing_address_customer_sync", stripeError);
            throw stripeError;
          }
        },
      },
    );

    return {
      provider: result.provider,
      sessionId: result.sessionId,
      url: result.url,
    };
  }

  async createCustomerPortalSession(
    _request: BillingPortalRequest,
  ): Promise<BillingPortalSession> {
    void _request;
    this.assertSecretConfigured();
    throw new BillingNotImplementedError("createCustomerPortalSession");
  }

  async verifyAndParseWebhook(input: {
    rawBody: string;
    headers: Headers;
  }) {
    const verified = verifyStripeWebhookSignature({
      rawBody: input.rawBody,
      headers: input.headers,
    });

    if (!verified.ok) {
      return {
        ok: false as const,
        status: verified.status,
        error: verified.error,
        eventType: "stripe.webhook.rejected",
        providerEventId: null,
        organizationId: null,
        metadata: {},
      };
    }

    return {
      ok: true as const,
      status: 200,
      eventType: verified.eventType,
      providerEventId: verified.eventId,
      organizationId: verified.object.metadataOrganizationId,
      metadata: {
        stripe_api_version: verified.apiVersion,
        stripe_created: verified.created,
        stripe_object: verified.object,
      },
    };
  }

  private assertSecretConfigured(): void {
    requireStripeSecretKey(readStripeSecretKey());
  }
}

/**
 * Stripe billing provider adapter (Phase 4B-1 foundation).
 *
 * Establishes configuration, mode awareness, and commercial-catalog boundary.
 * Does NOT create Customers, Checkout Sessions, Portal sessions, Subscriptions,
 * Invoices, or PaymentIntents. Webhook signature verification lands in 4B-5.
 */

import { BillingNotImplementedError } from "@/lib/billing/errors";
import { COMMERCIAL_PLAN_CATALOG } from "@/lib/billing/commercial-catalog";
import {
  getStripeBillingConfigStatus,
  isStripeSecretConfigured,
  readStripeSecretKey,
  requireStripeSecretKey,
} from "@/lib/billing/stripe/config";
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
    // Financial operations arrive in later Phase 4B slices.
    return {
      checkout: false,
      customerPortal: false,
      webhooks: false,
      cancelAtProvider: false,
    };
  }

  /** Sanitized config snapshot for server diagnostics (no secrets). */
  getConfigStatus() {
    return getStripeBillingConfigStatus();
  }

  /** Commercial catalog available to later Stripe Price resolution (4B-2). */
  getCommercialCatalog() {
    return COMMERCIAL_PLAN_CATALOG;
  }

  async createCheckoutSession(
    _request: BillingCheckoutRequest,
  ): Promise<BillingCheckoutSession> {
    void _request;
    this.assertSecretConfigured();
    throw new BillingNotImplementedError("createCheckoutSession");
  }

  async createCustomerPortalSession(
    _request: BillingPortalRequest,
  ): Promise<BillingPortalSession> {
    void _request;
    this.assertSecretConfigured();
    throw new BillingNotImplementedError("createCustomerPortalSession");
  }

  /**
   * Phase 4B-1: reject all webhooks. Signature verification + handlers are 4B-5.
   * Never accept unsigned events.
   */
  async verifyAndParseWebhook(_input: {
    rawBody: string;
    headers: Headers;
  }) {
    void _input;
    return {
      ok: false as const,
      status: 501,
      error:
        "Stripe webhook verification is not implemented yet (Phase 4B-5).",
      eventType: "stripe.webhook.not_implemented",
      providerEventId: null,
      organizationId: null,
      metadata: {},
    };
  }

  private assertSecretConfigured(): void {
    requireStripeSecretKey(readStripeSecretKey());
  }
}

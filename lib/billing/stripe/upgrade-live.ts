/**
 * Live Stripe adapters for subscription upgrade preview and confirmation.
 * Self-checks must not import this module.
 */

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import {
  createStripeCatalogPriceLister,
  createStripePriceByIdRetriever,
} from "@/lib/billing/stripe/catalog-stripe";
import type {
  LiveSubscriptionItem,
  RetrievedUpgradeSubscription,
  SubscriptionUpgradePreviewRequest,
  SubscriptionUpgradeUpdate,
  UpgradeStripeDeps,
} from "@/lib/billing/stripe/upgrade";

export function createStripeUpgradeDeps(secretKey: string): UpgradeStripeDeps {
  const stripe = getStripeClient(secretKey);
  return {
    retrieveSubscription: (subscriptionId) =>
      retrieveUpgradeSubscription(stripe, subscriptionId),
    listPrices: createStripeCatalogPriceLister(secretKey),
    getPriceById: createStripePriceByIdRetriever(secretKey),
    createPreview: (request) => createUpgradePreview(stripe, request),
    updateSubscription: (subscriptionId, params) =>
      updateExistingSubscription(stripe, subscriptionId, params),
  };
}

async function retrieveUpgradeSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<RetrievedUpgradeSubscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? "";
  const items: LiveSubscriptionItem[] = subscription.items.data.map((item) => ({
    id: item.id,
    priceId: item.price?.id ?? null,
    lookupKey: item.price?.lookup_key ?? null,
    periodStart: item.current_period_start ?? null,
    periodEnd: item.current_period_end ?? null,
  }));
  return {
    id: subscription.id,
    customerId,
    status: subscription.status,
    items,
  };
}

async function createUpgradePreview(
  stripe: Stripe,
  request: SubscriptionUpgradePreviewRequest,
): Promise<{ amountDueCents: number | null; currency: string | null }> {
  const invoice = await stripe.invoices.createPreview(
    request as unknown as Stripe.InvoiceCreatePreviewParams,
  );
  return {
    amountDueCents: invoice.amount_due ?? null,
    currency: invoice.currency ?? null,
  };
}

async function updateExistingSubscription(
  stripe: Stripe,
  subscriptionId: string,
  params: SubscriptionUpgradeUpdate["params"],
): Promise<{ id: string }> {
  const updated = await stripe.subscriptions.update(
    subscriptionId,
    params as unknown as Stripe.SubscriptionUpdateParams,
  );
  return { id: updated.id };
}

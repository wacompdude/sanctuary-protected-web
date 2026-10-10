/**
 * Live Stripe adapter for period-end cancellation.
 * Self-checks must not import this module.
 */

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import type {
  CancellationStripeDeps,
  RetrievedCancellationSubscription,
} from "@/lib/billing/stripe/cancellation";

export function createStripeCancellationDeps(
  secretKey: string,
): CancellationStripeDeps {
  const stripe = getStripeClient(secretKey);
  return {
    retrieveSubscription: (subscriptionId) =>
      retrieveCancellationSubscription(stripe, subscriptionId),
    updateCancelAtPeriodEnd: (subscriptionId, params, idempotencyKey) =>
      updateCancelAtPeriodEnd(stripe, subscriptionId, params, idempotencyKey),
  };
}

function mapSubscription(
  subscription: Stripe.Subscription,
): RetrievedCancellationSubscription {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? "";
  const item = subscription.items?.data?.[0];
  const schedule = subscription.schedule;
  const scheduleId =
    typeof schedule === "string" ? schedule : schedule?.id ?? null;
  return {
    id: subscription.id,
    customerId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    currentPeriodEnd: item?.current_period_end ?? null,
    priceId: item?.price?.id ?? null,
    canceledAt: subscription.canceled_at ?? null,
    scheduleId,
  };
}

async function retrieveCancellationSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<RetrievedCancellationSubscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return mapSubscription(subscription);
}

async function updateCancelAtPeriodEnd(
  stripe: Stripe,
  subscriptionId: string,
  params: { cancel_at_period_end: boolean },
  idempotencyKey: string,
): Promise<RetrievedCancellationSubscription> {
  const updated = await stripe.subscriptions.update(subscriptionId, params, {
    idempotencyKey,
  });
  return mapSubscription(updated);
}

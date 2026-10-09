/**
 * Stripe webhook event dispatcher (Phase 4B-4).
 */

import type { GetStripePriceById } from "@/lib/billing/stripe/plan-correlation";
import type { StripeWebhookObjectSummary } from "@/lib/billing/stripe/webhook-verify";
import {
  handleCheckoutSessionCompleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionLifecycle,
  handleSubscriptionSchedule,
  type WebhookHandlerResult,
  type WebhookSyncStore,
  type SubscriptionLifecycleOptions,
} from "@/lib/billing/stripe/webhook-sync";

export const STRIPE_WEBHOOK_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "subscription_schedule.created",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.aborted",
] as const;

export type StripeWebhookEventType = (typeof STRIPE_WEBHOOK_EVENT_TYPES)[number];

export function isHandledStripeWebhookEventType(
  eventType: string,
): eventType is StripeWebhookEventType {
  return (STRIPE_WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventType);
}

export async function dispatchStripeWebhookEvent(input: {
  eventType: string;
  object: StripeWebhookObjectSummary;
  store: WebhookSyncStore;
  providerEventId?: string | null;
  getPriceById?: GetStripePriceById;
  now?: Date;
  releaseCompletedSchedule?: SubscriptionLifecycleOptions["releaseCompletedSchedule"];
  confirmScheduleStatus?: SubscriptionLifecycleOptions["confirmScheduleStatus"];
  readLiveApprovedPlanKey?: SubscriptionLifecycleOptions["readLiveApprovedPlanKey"];
}): Promise<WebhookHandlerResult> {
  const lifecycleOptions = {
    providerEventId: input.providerEventId,
    getPriceById: input.getPriceById,
    now: input.now,
    releaseCompletedSchedule: input.releaseCompletedSchedule,
    confirmScheduleStatus: input.confirmScheduleStatus,
    readLiveApprovedPlanKey: input.readLiveApprovedPlanKey,
  };

  switch (input.eventType) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(input.store, input.object);
    case "customer.subscription.created":
      return handleSubscriptionLifecycle(
        input.store,
        input.object,
        "stripe_subscription_created",
        lifecycleOptions,
      );
    case "customer.subscription.updated":
      return handleSubscriptionLifecycle(
        input.store,
        input.object,
        "stripe_subscription_updated",
        lifecycleOptions,
      );
    case "customer.subscription.deleted":
      return handleSubscriptionLifecycle(
        input.store,
        {
          ...input.object,
          status: input.object.status ?? "canceled",
        },
        "stripe_subscription_deleted",
        lifecycleOptions,
      );
    case "invoice.paid":
      return handleInvoicePaid(input.store, input.object, lifecycleOptions);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(
        input.store,
        input.object,
        lifecycleOptions,
      );
    case "subscription_schedule.created":
    case "subscription_schedule.updated":
    case "subscription_schedule.released":
    case "subscription_schedule.canceled":
    case "subscription_schedule.completed":
    case "subscription_schedule.aborted":
      return handleSubscriptionSchedule(
        input.store,
        input.object,
        lifecycleOptions,
      );
    default:
      return {
        outcome: "ignored",
        detail: `Unhandled Stripe event type "${input.eventType.slice(0, 64)}".`,
        organizationId: null,
        metadata: { event_type: input.eventType },
      };
  }
}

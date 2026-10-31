/**
 * Stripe webhook event dispatcher (Phase 4B-4).
 */

import type { GetStripePriceById } from "@/lib/billing/stripe/plan-correlation";
import type { SmsPurchaseHandlerDeps } from "@/lib/billing/stripe/sms-purchase-webhook";
import {
  isSmsReplenishmentPaymentEvent,
  settleSmsReplenishmentPaymentEvent,
  type SmsReplenishmentSettlementStore,
} from "@/lib/billing/stripe/sms-replenishment-webhook";
import { isAuthoritativeLiveStripeMode } from "@/lib/billing/stripe/provider-mode";
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
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
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
  listCheckoutLineItems?: SmsPurchaseHandlerDeps["listCheckoutLineItems"];
  recordPaidSmsPackage?: SmsPurchaseHandlerDeps["recordPaidSmsPackage"];
  now?: Date;
  releaseCompletedSchedule?: SubscriptionLifecycleOptions["releaseCompletedSchedule"];
  confirmScheduleStatus?: SubscriptionLifecycleOptions["confirmScheduleStatus"];
  readLiveApprovedPlanKey?: SubscriptionLifecycleOptions["readLiveApprovedPlanKey"];
  settleSmsReplenishment?: SmsReplenishmentSettlementStore;
  /**
   * Provider mode from the webhook authority gate. When supplied it must be
   * "live"; non-live events never reach handlers/notifications. SMS grant and
   * replenishment settlement additionally require it explicitly.
   */
  providerMode?: string | null;
}): Promise<WebhookHandlerResult> {
  if (input.providerMode !== undefined && !isAuthoritativeLiveStripeMode(input.providerMode)) {
    return {
      outcome: "ignored",
      detail: "Non-Live Stripe event ignored for Production billing authority.",
      organizationId: null,
      metadata: { provider_mode: input.providerMode ?? null },
    };
  }
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
      return handleCheckoutSessionCompleted(input.store, input.object, {
        listCheckoutLineItems: input.listCheckoutLineItems,
        recordPaidSmsPackage: input.recordPaidSmsPackage,
        getPriceById: input.getPriceById,
        providerMode: input.providerMode ?? null,
      });
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
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
      if (!isSmsReplenishmentPaymentEvent(input.eventType, input.object)) {
        return {
          outcome: "ignored",
          detail: "PaymentIntent is not an automatic SMS replenishment.",
          organizationId: null,
          metadata: {},
        };
      }
      if (!input.settleSmsReplenishment) {
        return {
          outcome: "rejected",
          detail: "Automatic SMS replenishment settlement is not configured.",
          organizationId: input.object.metadataOrganizationId,
          metadata: { sms_auto_replenishment: true },
        };
      }
      // Replenishment settlement credits SMS after payment: Live evidence only.
      if (!isAuthoritativeLiveStripeMode(input.providerMode)) {
        return {
          outcome: "ignored",
          detail: "Automatic SMS replenishment requires Live Stripe payment evidence.",
          organizationId: null,
          metadata: { sms_auto_replenishment: true },
        };
      }
      return settleSmsReplenishmentPaymentEvent({
        eventType: input.eventType,
        object: input.object,
        store: input.settleSmsReplenishment,
        providerMode: input.providerMode,
      });
    default:
      return {
        outcome: "ignored",
        detail: `Unhandled Stripe event type "${input.eventType.slice(0, 64)}".`,
        organizationId: null,
        metadata: { event_type: input.eventType },
      };
  }
}

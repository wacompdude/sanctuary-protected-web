/**
 * Live Stripe adapters for scheduling a downgrade.
 * Self-checks must not import this module.
 */

import type Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import {
  createStripeCatalogPriceLister,
  createStripePriceByIdRetriever,
} from "@/lib/billing/stripe/catalog-stripe";
import { resolveApprovedSubscriptionPlanFromItems } from "@/lib/billing/stripe/plan-correlation";
import type {
  DowngradeScheduleUpdate,
  DowngradeStripeDeps,
  DowngradeSubscriptionItem,
  RetrievedDowngradeSchedule,
  RetrievedDowngradeSubscription,
} from "@/lib/billing/stripe/downgrade";

export function createStripeDowngradeDeps(
  secretKey: string,
  mirror: Pick<DowngradeStripeDeps, "saveScheduledMirror" | "saveReleasedMirror">,
): DowngradeStripeDeps {
  const stripe = getStripeClient(secretKey);
  return {
    retrieveSubscription: (subscriptionId) =>
      retrieveDowngradeSubscription(stripe, subscriptionId),
    listPrices: createStripeCatalogPriceLister(secretKey),
    getPriceById: createStripePriceByIdRetriever(secretKey),
    createScheduleFromSubscription: (subscriptionId, idempotencyKey) =>
      createSchedule(stripe, subscriptionId, idempotencyKey),
    retrieveSchedule: (scheduleId) => retrieveSchedule(stripe, scheduleId),
    updateSchedule: (scheduleId, params, idempotencyKey) =>
      updateSchedule(stripe, scheduleId, params, idempotencyKey),
    releaseSchedule: (scheduleId, idempotencyKey) =>
      releaseSchedule(stripe, scheduleId, idempotencyKey),
    saveScheduledMirror: mirror.saveScheduledMirror,
    saveReleasedMirror: mirror.saveReleasedMirror,
  };
}

async function retrieveDowngradeSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<RetrievedDowngradeSubscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? "";
  const schedule = subscription.schedule;
  const scheduleId =
    typeof schedule === "string" ? schedule : schedule?.id ?? null;
  const items: DowngradeSubscriptionItem[] = subscription.items.data.map((item) => ({
    id: item.id,
    priceId: item.price?.id ?? null,
    lookupKey: item.price?.lookup_key ?? null,
    quantity: item.quantity ?? 1,
    recurring: Boolean(item.price?.recurring),
    periodStart: item.current_period_start ?? null,
    periodEnd: item.current_period_end ?? null,
  }));
  return {
    id: subscription.id,
    customerId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    pendingUpdate: subscription.pending_update != null,
    scheduleId,
    items,
  };
}

async function createSchedule(
  stripe: Stripe,
  subscriptionId: string,
  idempotencyKey: string,
): Promise<{ id: string }> {
  const schedule = await stripe.subscriptionSchedules.create(
    { from_subscription: subscriptionId },
    { idempotencyKey },
  );
  return { id: schedule.id };
}

async function retrieveSchedule(
  stripe: Stripe,
  scheduleId: string,
): Promise<RetrievedDowngradeSchedule> {
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const subscription = schedule.subscription;
  return {
    id: schedule.id,
    status: schedule.status ?? "",
    subscriptionId:
      typeof subscription === "string" ? subscription : subscription?.id ?? null,
    phases: (schedule.phases ?? []).map((phase) => ({
      startDate: phase.start_date ?? null,
      endDate: phase.end_date ?? null,
      items: (phase.items ?? []).map((item) => ({
        priceId: typeof item.price === "string" ? item.price : item.price?.id ?? null,
        quantity: item.quantity ?? 1,
      })),
    })),
  };
}

async function updateSchedule(
  stripe: Stripe,
  scheduleId: string,
  params: DowngradeScheduleUpdate,
  idempotencyKey: string,
): Promise<{ id: string; subscriptionId: string | null }> {
  const schedule = await stripe.subscriptionSchedules.update(scheduleId, params, {
    idempotencyKey,
  });
  const subscription = schedule.subscription;
  return {
    id: schedule.id,
    subscriptionId:
      typeof subscription === "string" ? subscription : subscription?.id ?? null,
  };
}

async function releaseSchedule(
  stripe: Stripe,
  scheduleId: string,
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  const schedule = await stripe.subscriptionSchedules.release(
    scheduleId,
    {},
    { idempotencyKey },
  );
  return { id: schedule.id, status: schedule.status ?? "" };
}

export function createStripeScheduleCleanupDeps(secretKey: string): {
  releaseCompletedSchedule: (
    input: { scheduleId: string; idempotencyKey: string },
  ) => Promise<{ status: string }>;
  confirmScheduleStatus: (scheduleId: string) => Promise<string | null>;
  readLiveApprovedPlanKey: (subscriptionId: string) => Promise<string | null>;
} {
  const stripe = getStripeClient(secretKey);
  const getPriceById = createStripePriceByIdRetriever(secretKey);
  return {
    async releaseCompletedSchedule(input) {
      try {
        const released = await releaseSchedule(
          stripe,
          input.scheduleId,
          input.idempotencyKey,
        );
        return { status: released.status };
      } catch {
        const again = await retrieveSchedule(stripe, input.scheduleId).catch(() => null);
        if (again && (again.status === "released" || again.status === "completed")) {
          return { status: again.status };
        }
        throw new Error("Subscription schedule release failed.");
      }
    },
    async confirmScheduleStatus(scheduleId) {
      const schedule = await retrieveSchedule(stripe, scheduleId).catch(() => null);
      return schedule?.status ?? null;
    },
    async readLiveApprovedPlanKey(subscriptionId) {
      const subscription = await retrieveDowngradeSubscription(stripe, subscriptionId);
      const resolution = await resolveApprovedSubscriptionPlanFromItems(
        subscription.items.map((item) => ({
          priceId: item.priceId,
          lookupKey: item.lookupKey,
          productName: null,
        })),
        { getPriceById },
      );
      return resolution.ok ? resolution.planKey : null;
    },
  };
}

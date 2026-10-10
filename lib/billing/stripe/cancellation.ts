/**
 * Period-end cancellation and reversal for an existing Stripe subscription.
 * Stripe remains the authority. This module does not call Stripe.
 * Self-checks must not import cancellation-live.ts.
 *
 * cancelled_at on organization_subscriptions is the local timestamp recorded
 * when a subscription becomes status cancelled. It is not Stripe canceled_at
 * (the time period-end cancellation was requested) and it is not the
 * paid-through date. Pending cancellation is cancel_at_period_end. The
 * paid-through date is current_period_end.
 */

import { BillingDowngradeError } from "@/lib/billing/errors";
import { DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE } from "@/lib/billing/stripe/downgrade";

export class BillingCancellationError extends Error {
  readonly code = "billing_cancellation_error";

  constructor(message: string) {
    super(message);
    this.name = "BillingCancellationError";
  }
}

export const PENDING_CANCELLATION_PLAN_CHANGE_MESSAGE =
  "Your subscription is scheduled to cancel at the end of the current billing period. Keep the subscription before changing plans.";

export const CANCELLATION_NOT_CHANGED_MESSAGE =
  "The subscription could not be updated. Your current plan was not changed.";

export const TRIAL_CANCELLATION_MESSAGE =
  "Cancel at period end is available after a paid Stripe subscription starts. Trial access ends on its own schedule.";

const CANCELLABLE_STATUSES = new Set([
  "active",
  "past_due",
  "unpaid",
  "trialing",
]);

const FORBIDDEN_CLIENT_FIELDS = [
  "subscription_id",
  "subscriptionId",
  "customer_id",
  "customerId",
  "price_id",
  "priceId",
  "schedule_id",
  "scheduleId",
] as const;

export type LocalCancellationSubscription = {
  planKey: string;
  planDisplayName: string;
  billingProvider: string | null;
  billingCustomerId: string;
  billingSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  activeDowngradeSchedule: boolean;
  currentPeriodEnd: string | null;
};

export type RetrievedCancellationSubscription = {
  id: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  /** Unix seconds from the live subscription item. Not a browser value. */
  currentPeriodEnd: number | null;
  priceId: string | null;
  /** Stripe canceled_at. Request time, not the paid-through date. */
  canceledAt: number | null;
  scheduleId: string | null;
};

export type CancellationUpdate = {
  subscriptionId: string;
  params: { cancel_at_period_end: boolean };
  idempotencyKey: string;
};

export type CancellationStripeDeps = {
  retrieveSubscription: (
    subscriptionId: string,
  ) => Promise<RetrievedCancellationSubscription>;
  updateCancelAtPeriodEnd: (
    subscriptionId: string,
    params: { cancel_at_period_end: boolean },
    idempotencyKey: string,
  ) => Promise<RetrievedCancellationSubscription>;
};

export type CancellationResult = {
  changed: boolean;
  subscriptionId: string;
  planKey: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  priceId: string | null;
  history: {
    changeType: "cancellation_scheduled" | "cancellation_reversed";
    transition: string;
  } | null;
};

export function assertNoClientCancellationIds(
  payload: Record<string, unknown>,
): void {
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (field in payload && payload[field] != null && payload[field] !== "") {
      throw new BillingCancellationError(
        "Billing identifiers are resolved by the server.",
      );
    }
  }
}

export function periodEndCancellationIdempotencyKey(input: {
  subscriptionId: string;
  periodEndUnix: number | null;
  cancelAtPeriodEnd: boolean;
}): string {
  const end =
    input.periodEndUnix == null ? "none" : String(input.periodEndUnix);
  const op = input.cancelAtPeriodEnd ? "cancel" : "keep";
  return `period_end_${op}_${input.subscriptionId}_${end}`;
}

export function cancellationTransitionKey(input: {
  subscriptionId: string;
  kind: "cancellation_scheduled" | "cancellation_reversed";
  periodEndUnix: number | null;
  stripeCanceledAt: number | null;
}): string {
  const end =
    input.periodEndUnix == null ? "none" : String(input.periodEndUnix);
  const requested =
    input.stripeCanceledAt == null ? "none" : String(input.stripeCanceledAt);
  return `${input.kind}:${input.subscriptionId}:${end}:${requested}`;
}

export function formatAccessThroughDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function pendingCancellationCopy(input: {
  planDisplayName: string;
  paidThroughIso: string;
}): { title: string; through: string; access: string } {
  const plan = input.planDisplayName.trim() || "Your current";
  const date = formatAccessThroughDate(input.paidThroughIso);
  return {
    title: "Subscription scheduled to cancel",
    through: date
      ? `Your ${plan} subscription will remain active through ${date}.`
      : `Your ${plan} subscription will remain active through the end of the current paid period.`,
    access:
      "You will continue to have access to your current plan and features until that date.",
  };
}

/**
 * Flag-only history. Final cancellation is a status change and is recorded
 * separately. Undefined previous means the mirror did not load the flag, so
 * a same-state webhook must not invent a transition.
 */
export function cancellationHistoryChange(input: {
  previousCancelAtPeriodEnd: boolean | null | undefined;
  nextCancelAtPeriodEnd: boolean;
  nextStatus: string;
}): "cancellation_scheduled" | "cancellation_reversed" | null {
  if (input.nextStatus === "cancelled") return null;
  if (typeof input.previousCancelAtPeriodEnd !== "boolean") return null;
  if (input.previousCancelAtPeriodEnd === input.nextCancelAtPeriodEnd) {
    return null;
  }
  return input.nextCancelAtPeriodEnd
    ? "cancellation_scheduled"
    : "cancellation_reversed";
}

export function nextCancellationHistory(input: {
  existingTransitions: readonly string[];
  existingEventChangeTypes: readonly { eventId: string; changeType: string }[];
  eventId: string | null;
  previousCancelAtPeriodEnd: boolean | null | undefined;
  nextCancelAtPeriodEnd: boolean;
  nextStatus: string;
  subscriptionId: string;
  periodEndUnix: number | null;
  stripeCanceledAt: number | null;
}): {
  changeType: "cancellation_scheduled" | "cancellation_reversed";
  transition: string;
} | null {
  const changeType = cancellationHistoryChange({
    previousCancelAtPeriodEnd: input.previousCancelAtPeriodEnd,
    nextCancelAtPeriodEnd: input.nextCancelAtPeriodEnd,
    nextStatus: input.nextStatus,
  });
  if (!changeType) return null;
  const transition = cancellationTransitionKey({
    subscriptionId: input.subscriptionId,
    kind: changeType,
    periodEndUnix: input.periodEndUnix,
    stripeCanceledAt: input.stripeCanceledAt,
  });
  if (input.existingTransitions.includes(transition)) return null;
  const eventId = input.eventId?.trim() || "";
  if (
    eventId &&
    input.existingEventChangeTypes.some(
      (row) => row.eventId === eventId && row.changeType === changeType,
    )
  ) {
    return null;
  }
  return { changeType, transition };
}

function assertLocalPaidSubscription(
  local: LocalCancellationSubscription,
): LocalCancellationSubscription {
  const provider = (local.billingProvider ?? "").trim().toLowerCase();
  if (provider !== "stripe") {
    throw new BillingCancellationError(
      "This organization is not billed through Stripe.",
    );
  }
  const subscriptionId = local.billingSubscriptionId.trim();
  const customerId = local.billingCustomerId.trim();
  if (!subscriptionId || !customerId) {
    throw new BillingCancellationError(TRIAL_CANCELLATION_MESSAGE);
  }
  if (!CANCELLABLE_STATUSES.has(local.status)) {
    throw new BillingCancellationError(
      "This subscription cannot be changed in its current status.",
    );
  }
  if (local.activeDowngradeSchedule) {
    throw new BillingDowngradeError(DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE);
  }
  return local;
}

function assertLiveMatches(
  local: LocalCancellationSubscription,
  live: RetrievedCancellationSubscription,
): void {
  if (live.id !== local.billingSubscriptionId.trim()) {
    throw new BillingCancellationError(
      "The live subscription does not match this organization.",
    );
  }
  if (live.customerId !== local.billingCustomerId.trim()) {
    throw new BillingCancellationError(
      "The live subscription does not belong to this organization's Stripe customer.",
    );
  }
  if (!CANCELLABLE_STATUSES.has(live.status)) {
    throw new BillingCancellationError(
      "This subscription cannot be changed in its current status.",
    );
  }
  if ((live.scheduleId ?? "").trim()) {
    throw new BillingDowngradeError(DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE);
  }
}

export async function setSubscriptionCancelAtPeriodEnd(input: {
  local: LocalCancellationSubscription;
  cancelAtPeriodEnd: boolean;
  deps: CancellationStripeDeps;
}): Promise<CancellationResult> {
  const local = assertLocalPaidSubscription(input.local);
  const live = await input.deps.retrieveSubscription(
    local.billingSubscriptionId.trim(),
  );
  assertLiveMatches(local, live);
  const paidThrough =
    live.currentPeriodEnd != null
      ? new Date(live.currentPeriodEnd * 1000).toISOString()
      : local.currentPeriodEnd;

  if (live.cancelAtPeriodEnd === input.cancelAtPeriodEnd) {
    return {
      changed: false,
      subscriptionId: live.id,
      planKey: local.planKey,
      cancelAtPeriodEnd: live.cancelAtPeriodEnd,
      currentPeriodEnd: paidThrough,
      priceId: live.priceId,
      history: null,
    };
  }

  const update: CancellationUpdate = {
    subscriptionId: live.id,
    params: { cancel_at_period_end: input.cancelAtPeriodEnd },
    idempotencyKey: periodEndCancellationIdempotencyKey({
      subscriptionId: live.id,
      periodEndUnix: live.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    }),
  };
  const updated = await input.deps.updateCancelAtPeriodEnd(
    update.subscriptionId,
    update.params,
    update.idempotencyKey,
  );
  // Retrieve again so a cached idempotent response cannot mirror a flag
  // Stripe did not actually store.
  const confirmed = await input.deps.retrieveSubscription(updated.id);
  if (confirmed.id !== live.id) {
    throw new BillingCancellationError(CANCELLATION_NOT_CHANGED_MESSAGE);
  }
  if (confirmed.cancelAtPeriodEnd !== input.cancelAtPeriodEnd) {
    throw new BillingCancellationError(CANCELLATION_NOT_CHANGED_MESSAGE);
  }
  if (confirmed.priceId !== live.priceId) {
    throw new BillingCancellationError(CANCELLATION_NOT_CHANGED_MESSAGE);
  }
  if (confirmed.customerId !== live.customerId) {
    throw new BillingCancellationError(CANCELLATION_NOT_CHANGED_MESSAGE);
  }

  const history = nextCancellationHistory({
    existingTransitions: [],
    existingEventChangeTypes: [],
    eventId: null,
    previousCancelAtPeriodEnd: live.cancelAtPeriodEnd,
    nextCancelAtPeriodEnd: confirmed.cancelAtPeriodEnd,
    nextStatus: confirmed.status === "canceled" ? "cancelled" : confirmed.status,
    subscriptionId: confirmed.id,
    periodEndUnix: confirmed.currentPeriodEnd ?? live.currentPeriodEnd,
    stripeCanceledAt: confirmed.canceledAt,
  });

  return {
    changed: true,
    subscriptionId: confirmed.id,
    planKey: local.planKey,
    cancelAtPeriodEnd: confirmed.cancelAtPeriodEnd,
    currentPeriodEnd:
      confirmed.currentPeriodEnd != null
        ? new Date(confirmed.currentPeriodEnd * 1000).toISOString()
        : paidThrough,
    priceId: confirmed.priceId,
    history,
  };
}

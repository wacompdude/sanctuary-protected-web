import { isLocalNoCardTrialSubscription } from "@/lib/billing/stripe/provider-mode";
import { PLAN_KEYS, type PlanKey } from "@/lib/subscriptions/plan-keys";
import type { ChurchSubscriptionStatus } from "@/lib/subscriptions/types";

/** Statuses that count as the church's current subscription row. */
export const CURRENT_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "grace_period",
  "incomplete",
] as const satisfies readonly ChurchSubscriptionStatus[];

/**
 * Statuses that still grant product entitlements (Phase 5+ enforcement).
 * `incomplete` is excluded until checkout/activation finishes.
 * Local no-card trials also require an unexpired `trial_end` — see
 * {@link subscriptionRecordGrantsAccess}.
 */
export const ACCESS_GRANTING_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "grace_period",
] as const satisfies readonly ChurchSubscriptionStatus[];

const PLAN_RANK: Record<PlanKey, number> = {
  [PLAN_KEYS.SERVANT_STANDARD]: 0,
  [PLAN_KEYS.STEWARD_PRO]: 1,
  [PLAN_KEYS.SHEPHERD_PLUS]: 2,
  [PLAN_KEYS.OMNI_ENTERPRISE]: 3,
};

export function isCurrentSubscriptionStatus(
  status: string,
): status is (typeof CURRENT_SUBSCRIPTION_STATUSES)[number] {
  return (CURRENT_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

export function subscriptionGrantsAccess(status: string): boolean {
  return (ACCESS_GRANTING_STATUSES as readonly string[]).includes(status);
}

export type SubscriptionAccessRecord = {
  status: string;
  trialEnd?: string | Date | null;
  billingProvider?: string | null;
  billingSubscriptionId?: string | null;
  providerMode?: string | null;
};

/**
 * Entitlement gate for a subscription row.
 * Status alone is not enough for local no-card trials: those also need a
 * valid, unexpired `trial_end` (server clock). Provider-backed Live rows keep
 * status-based access; Stripe remains authoritative for paid lifecycle.
 */
export function subscriptionRecordGrantsAccess(
  input: SubscriptionAccessRecord,
  now: Date = new Date(),
): boolean {
  if (!subscriptionGrantsAccess(input.status)) return false;

  if (
    isLocalNoCardTrialSubscription({
      status: input.status,
      billingProvider: input.billingProvider,
      billingSubscriptionId: input.billingSubscriptionId,
      providerMode: input.providerMode,
    })
  ) {
    return isTrialActive({
      status: input.status,
      trialEnd: input.trialEnd,
      now,
    });
  }

  return true;
}

/** True when a local no-card trial row is past its authoritative trial_end. */
export function isLocalNoCardTrialExpired(
  input: SubscriptionAccessRecord,
  now: Date = new Date(),
): boolean {
  if (
    !isLocalNoCardTrialSubscription({
      status: input.status,
      billingProvider: input.billingProvider,
      billingSubscriptionId: input.billingSubscriptionId,
      providerMode: input.providerMode,
    })
  ) {
    return false;
  }
  return !isTrialActive({
    status: input.status,
    trialEnd: input.trialEnd,
    now,
  });
}

export function planRank(planKey: string): number {
  if (planKey in PLAN_RANK) {
    return PLAN_RANK[planKey as PlanKey];
  }
  return -1;
}

export function isPlanDowngrade(fromPlanKey: string, toPlanKey: string): boolean {
  const from = planRank(fromPlanKey);
  const to = planRank(toPlanKey);
  if (from < 0 || to < 0) return false;
  return to < from;
}

export function isPlanUpgrade(fromPlanKey: string, toPlanKey: string): boolean {
  const from = planRank(fromPlanKey);
  const to = planRank(toPlanKey);
  if (from < 0 || to < 0) return false;
  return to > from;
}

export type PeriodWindow = {
  start: Date;
  end: Date;
};

export function buildPeriodWindow(
  periodDays: number,
  from: Date = new Date(),
): PeriodWindow {
  const days = Number.isFinite(periodDays) ? Math.max(1, Math.floor(periodDays)) : 30;
  const start = new Date(from.getTime());
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function isWithinPeriod(
  periodStart: string | Date | null | undefined,
  periodEnd: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!periodStart && !periodEnd) return true;
  if (periodStart) {
    const start =
      periodStart instanceof Date ? periodStart : new Date(periodStart);
    if (Number.isNaN(start.getTime()) || now < start) return false;
  }
  if (periodEnd) {
    const end = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
    if (Number.isNaN(end.getTime()) || now > end) return false;
  }
  return true;
}

/**
 * Billing screens show a trial end only while the organization is still trialing.
 * A paid active subscription keeps any stored historical trial date hidden.
 */
export function shouldDisplayTrialEnd(input: {
  subscriptionStatus?: string | null;
  organizationStatus?: string | null;
}): boolean {
  if (input.subscriptionStatus === "trialing") return true;
  if (input.subscriptionStatus) return false;
  return input.organizationStatus === "trial";
}

/**
 * Local / display trial window check.
 * Fail closed: missing or invalid `trialEnd` never counts as active.
 * Compare against server-supplied `now` (default: server clock).
 */
export function isTrialActive(params: {
  status: string;
  trialEnd?: string | Date | null;
  now?: Date;
}): boolean {
  if (params.status !== "trialing") return false;
  if (params.trialEnd == null || params.trialEnd === "") return false;
  const end =
    params.trialEnd instanceof Date
      ? params.trialEnd
      : new Date(params.trialEnd);
  if (Number.isNaN(end.getTime())) return false;
  return (params.now ?? new Date()) <= end;
}

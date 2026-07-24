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

export function isTrialActive(params: {
  status: string;
  trialEnd?: string | Date | null;
  now?: Date;
}): boolean {
  if (params.status !== "trialing") return false;
  if (!params.trialEnd) return true;
  const end =
    params.trialEnd instanceof Date
      ? params.trialEnd
      : new Date(params.trialEnd);
  if (Number.isNaN(end.getTime())) return true;
  return (params.now ?? new Date()) <= end;
}

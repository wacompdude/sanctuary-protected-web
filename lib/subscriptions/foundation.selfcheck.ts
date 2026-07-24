import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import { recommendPlanFromSignals } from "@/lib/subscriptions/recommend-plan";
import {
  buildPeriodWindow,
  isPlanDowngrade,
  isPlanUpgrade,
  isTrialActive,
  isWithinPeriod,
  planRank,
  subscriptionGrantsAccess,
} from "@/lib/subscriptions/status";

/**
 * Phase 4 subscription foundation self-check (no database required).
 * Run: npx --yes tsx lib/subscriptions/foundation.selfcheck.ts
 */
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  planRank(PLAN_KEYS.SERVANT_STANDARD) < planRank(PLAN_KEYS.STEWARD_PRO),
  "servant ranks below steward",
);
assert(
  planRank(PLAN_KEYS.STEWARD_PRO) < planRank(PLAN_KEYS.SHEPHERD_PLUS),
  "steward ranks below shepherd",
);
assert(
  isPlanUpgrade(PLAN_KEYS.SERVANT_STANDARD, PLAN_KEYS.SHEPHERD_PLUS),
  "servant → shepherd is upgrade",
);
assert(
  isPlanDowngrade(PLAN_KEYS.SHEPHERD_PLUS, PLAN_KEYS.STEWARD_PRO),
  "shepherd → steward is downgrade",
);
assert(
  !isPlanDowngrade(PLAN_KEYS.SERVANT_STANDARD, PLAN_KEYS.STEWARD_PRO),
  "servant → steward is not a downgrade",
);

assert(subscriptionGrantsAccess("trialing"), "trialing grants access");
assert(subscriptionGrantsAccess("active"), "active grants access");
assert(subscriptionGrantsAccess("past_due"), "past_due grants access");
assert(subscriptionGrantsAccess("grace_period"), "grace_period grants access");
assert(!subscriptionGrantsAccess("incomplete"), "incomplete does not grant access");
assert(!subscriptionGrantsAccess("cancelled"), "cancelled does not grant access");

const window = buildPeriodWindow(30, new Date("2026-01-01T00:00:00.000Z"));
assert(
  window.end.getTime() - window.start.getTime() === 30 * 24 * 60 * 60 * 1000,
  "30-day period window length",
);
assert(
  isWithinPeriod(window.start, window.end, new Date("2026-01-15T00:00:00.000Z")),
  "mid-period is within window",
);
assert(
  !isWithinPeriod(window.start, window.end, new Date("2026-03-01T00:00:00.000Z")),
  "after period end is outside window",
);

assert(
  isTrialActive({
    status: "trialing",
    trialEnd: "2026-12-31T00:00:00.000Z",
    now: new Date("2026-06-01T00:00:00.000Z"),
  }),
  "open trial is active",
);
assert(
  !isTrialActive({
    status: "active",
    trialEnd: "2026-12-31T00:00:00.000Z",
  }),
  "active status is not trialing",
);

assert(
  recommendPlanFromSignals({
    activeCampusCount: 1,
    hasPolicyDocuments: false,
    hasMedicalSupplies: false,
    hasHardwareInventory: false,
    hasIncidentPhotos: false,
  }) === PLAN_KEYS.SERVANT_STANDARD,
  "empty usage → servant",
);
assert(
  recommendPlanFromSignals({
    activeCampusCount: 1,
    hasPolicyDocuments: false,
    hasMedicalSupplies: true,
    hasHardwareInventory: false,
    hasIncidentPhotos: false,
  }) === PLAN_KEYS.STEWARD_PRO,
  "medical → steward",
);
assert(
  recommendPlanFromSignals({
    activeCampusCount: 1,
    hasPolicyDocuments: false,
    hasMedicalSupplies: false,
    hasHardwareInventory: false,
    hasIncidentPhotos: true,
  }) === PLAN_KEYS.STEWARD_PRO,
  "photos → steward",
);
assert(
  recommendPlanFromSignals({
    activeCampusCount: 2,
    hasPolicyDocuments: false,
    hasMedicalSupplies: true,
    hasHardwareInventory: false,
    hasIncidentPhotos: false,
  }) === PLAN_KEYS.SHEPHERD_PLUS,
  "multi-campus → shepherd (not steward)",
);
assert(
  recommendPlanFromSignals({
    activeCampusCount: 1,
    hasPolicyDocuments: true,
    hasMedicalSupplies: false,
    hasHardwareInventory: false,
    hasIncidentPhotos: false,
  }) === PLAN_KEYS.SHEPHERD_PLUS,
  "policies → shepherd",
);

console.log("subscription foundation self-check passed");

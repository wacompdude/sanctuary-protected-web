import type { FeatureAccessResult } from "@/lib/subscriptions/types";
import { FEATURE_DISPLAY_NAMES, FEATURE_KEYS, type FeatureKey } from "@/lib/subscriptions/feature-keys";
import { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";
import {
  PLAN_DISPLAY_NAMES,
  PLAN_KEY_LIST,
  type PlanKey,
} from "@/lib/subscriptions/plan-keys";
import { planRank } from "@/lib/subscriptions/status";

export const FEATURE_ACCESS_REASONS = {
  AVAILABLE: "AVAILABLE",
  TIER_REQUIRED: "TIER_REQUIRED",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  UNKNOWN_FEATURE: "UNKNOWN_FEATURE",
} as const;

export type FeatureAccessReasonCode =
  (typeof FEATURE_ACCESS_REASONS)[keyof typeof FEATURE_ACCESS_REASONS];

export type MinimumPlanInfo = {
  planKey: string;
  displayName: string;
};

export type FeatureLockSummary = {
  featureKey: FeatureKey;
  featureName: string;
  currentPlanKey: string | null;
  currentPlanName: string | null;
  minimumPlanKey: string | null;
  minimumPlanName: string | null;
  title: string;
  shortMessage: string;
  longMessage: string;
  benefits: string[];
};

export const FEATURE_BENEFITS: Partial<Record<FeatureKey, string[]>> = {
  [FEATURE_KEYS.TRAINING_MANAGEMENT]: [
    "Training event scheduling",
    "Attendance tracking",
    "Completion records",
    "Required training",
    "Training reports",
  ],
  [FEATURE_KEYS.POLICIES]: [
    "Policy and procedure library",
    "Acknowledgments",
    "Emergency policy access",
  ],
  [FEATURE_KEYS.MEDICAL_INVENTORY]: [
    "Medical supply inventory",
    "Expiration tracking",
    "Incident usage records",
  ],
  [FEATURE_KEYS.HARDWARE_INVENTORY]: [
    "Security hardware inventory",
    "Maintenance tracking",
    "Hardware reports",
  ],
  [FEATURE_KEYS.SAFETY_CONCERN_PROFILES]: [
    "Known safety concern profiles",
    "Photo identification",
    "Campus-aware alerts",
  ],
  [FEATURE_KEYS.TEAM_SCHEDULING]: [
    "Team calendars",
    "Shift assignment",
    "Availability and templates",
  ],
  [FEATURE_KEYS.CAMERAS]: [
    "Live camera access",
    "Device management",
    "Integrated security monitoring",
  ],
  [FEATURE_KEYS.SENSORS]: [
    "Sensor status monitoring",
    "Alarm notifications",
    "Integrated sensor coverage",
  ],
  [FEATURE_KEYS.MULTI_CAMPUS]: [
    "Multiple campus records",
    "Campus-scoped operations",
  ],
  [FEATURE_KEYS.INCIDENT_PHOTOS]: [
    "Photo attachments on incidents",
    "Visual documentation for reviews",
  ],
  [FEATURE_KEYS.ADVANCED_ANALYTICS]: [
    "Advanced analytics",
    "Deeper operational reporting",
  ],
  [FEATURE_KEYS.SMS]: [
    "SMS messaging",
    "Urgent team alerts by text",
  ],
};

export function featureDisplayName(featureKey: FeatureKey | string): string {
  return FEATURE_DISPLAY_NAMES[featureKey as FeatureKey] ?? "This feature";
}

export function minimumPlanFromExpectedMatrix(
  featureKey: FeatureKey,
): MinimumPlanInfo | null {
  let best: MinimumPlanInfo | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const planKey of PLAN_KEY_LIST) {
    const value = EXPECTED_PLAN_ENTITLEMENTS[planKey][featureKey];
    const enabled = value === true || (typeof value === "number" && value > 0);
    if (!enabled) continue;
    const rank = planRank(planKey);
    if (rank < bestRank) {
      bestRank = rank;
      best = {
        planKey,
        displayName: PLAN_DISPLAY_NAMES[planKey],
      };
    }
  }

  return best;
}

export function minimumPlanFromPlanRows(
  featureKey: string,
  rows: Array<{
    featureKey: string;
    planKey: string;
    displayName: string;
    sortOrder: number;
    enabled: boolean;
  }>,
): MinimumPlanInfo | null {
  const matches = rows
    .filter((row) => row.featureKey === featureKey && row.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder || planRank(a.planKey) - planRank(b.planKey));
  const first = matches[0];
  if (!first) return null;
  return { planKey: first.planKey, displayName: first.displayName };
}

export function buildUpgradeCopy(params: {
  featureKey: FeatureKey | string;
  currentPlanName?: string | null;
  minimumPlanName?: string | null;
  benefits?: string[];
}): {
  title: string;
  shortMessage: string;
  longMessage: string;
  accessibleDescription: string;
} {
  const title = featureDisplayName(params.featureKey);
  const current = params.currentPlanName?.trim() || null;
  const minimum = params.minimumPlanName?.trim() || null;

  const shortMessage = minimum
    ? `${title} requires ${minimum} or higher.`
    : `${title} is not included with your current plan.`;

  const currentLine = current
    ? `${title} is not included with your current ${current} plan.`
    : `${title} is not included with your current plan.`;

  const minLine = minimum
    ? `Minimum required plan: ${minimum}.`
    : "Upgrade your plan to unlock this feature.";

  const longMessage = `${currentLine} ${minLine}`.trim();

  return {
    title,
    shortMessage,
    longMessage,
    accessibleDescription: `${title} is unavailable on your current plan. ${
      minimum ? `${minimum} or higher is required.` : "A higher plan is required."
    }`,
  };
}

export function buildFeatureLockSummary(params: {
  featureKey: FeatureKey;
  currentPlanKey?: string | null;
  currentPlanName?: string | null;
  minimumPlan?: MinimumPlanInfo | null;
}): FeatureLockSummary {
  const copy = buildUpgradeCopy({
    featureKey: params.featureKey,
    currentPlanName: params.currentPlanName,
    minimumPlanName: params.minimumPlan?.displayName,
  });

  return {
    featureKey: params.featureKey,
    featureName: copy.title,
    currentPlanKey: params.currentPlanKey ?? null,
    currentPlanName: params.currentPlanName ?? null,
    minimumPlanKey: params.minimumPlan?.planKey ?? null,
    minimumPlanName: params.minimumPlan?.displayName ?? null,
    title: copy.title,
    shortMessage: copy.shortMessage,
    longMessage: copy.longMessage,
    benefits: FEATURE_BENEFITS[params.featureKey] ?? [],
  };
}

export function lockSummaryFromAccess(
  access: FeatureAccessResult,
): FeatureLockSummary {
  return buildFeatureLockSummary({
    featureKey: access.featureKey,
    currentPlanKey: access.planKey,
    currentPlanName: access.planDisplayName,
    minimumPlan:
      access.minimumPlanKey && access.minimumPlanDisplayName
        ? {
            planKey: access.minimumPlanKey,
            displayName: access.minimumPlanDisplayName,
          }
        : null,
  });
}

export function isKnownPlanKey(value: string): value is PlanKey {
  return (PLAN_KEY_LIST as readonly string[]).includes(value);
}

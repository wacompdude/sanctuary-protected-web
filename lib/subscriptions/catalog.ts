import { cache } from "react";
import {
  BOOLEAN_FEATURE_KEYS,
} from "@/lib/subscriptions/entitlement-values";
import {
  buildFeatureLockSummary,
  minimumPlanFromExpectedMatrix,
  minimumPlanFromPlanRows,
  type FeatureLockSummary,
  type MinimumPlanInfo,
} from "@/lib/subscriptions/feature-access";
import {
  FEATURE_CUSTOMER_HELP,
  FEATURE_DISPLAY_NAMES,
  FEATURE_KEYS,
  isFeatureKey,
  type FeatureKey,
} from "@/lib/subscriptions/feature-keys";
import {
  listFeatures,
  listPlanFeatureMatrix,
} from "@/lib/subscriptions/queries";
import type {
  FeatureRecord,
  PlanFeatureAssignment,
  SubscriptionPlanRecord,
} from "@/lib/subscriptions/types";

export type PlanComparisonCell = {
  included: boolean;
  limit: number | null;
  unlimited: boolean;
};

export type PlanComparisonRow = {
  featureKey: string;
  displayName: string;
  description: string | null;
  helperText?: string | null;
  category: string;
  valueType: string;
  cells: Record<string, PlanComparisonCell>;
};

function customerFacingFeatureName(feature: FeatureRecord): string {
  const key = String(feature.feature_key);
  if (key === FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT) {
    return FEATURE_DISPLAY_NAMES[FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT];
  }
  if (isFeatureKey(key) && FEATURE_DISPLAY_NAMES[key]) {
    return feature.display_name || FEATURE_DISPLAY_NAMES[key];
  }
  return feature.display_name || key;
}

function assignmentEnabled(assignment: PlanFeatureAssignment): boolean {
  if (assignment.value_type === "boolean") {
    return assignment.boolean_value === true;
  }
  if (assignment.value_type === "integer") {
    return assignment.integer_value === null || (assignment.integer_value ?? 0) > 0;
  }
  if (assignment.value_type === "decimal") {
    return assignment.decimal_value === null || (assignment.decimal_value ?? 0) > 0;
  }
  return Boolean(assignment.text_value || assignment.json_value);
}

export function buildMinimumPlanMap(
  plans: SubscriptionPlanRecord[],
  assignments: PlanFeatureAssignment[],
): Map<string, MinimumPlanInfo> {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const rows = assignments.map((assignment) => {
    const plan = planById.get(assignment.plan_id);
    return {
      featureKey: String(assignment.feature_key),
      planKey: plan ? String(plan.plan_key) : "",
      displayName: plan?.display_name ?? String(plan?.plan_key ?? ""),
      sortOrder: plan?.sort_order ?? 999,
      enabled: assignmentEnabled(assignment),
    };
  });

  const map = new Map<string, MinimumPlanInfo>();
  for (const featureKey of new Set(rows.map((row) => row.featureKey))) {
    const minimum = minimumPlanFromPlanRows(featureKey, rows);
    if (minimum) map.set(featureKey, minimum);
  }
  return map;
}

export const getFeatureMinimumPlanMap = cache(
  async (): Promise<Map<string, MinimumPlanInfo>> => {
    const matrix = await listPlanFeatureMatrix();
    if (matrix.plans.length === 0 || matrix.assignments.length === 0) {
      const fallback = new Map<string, MinimumPlanInfo>();
      for (const featureKey of BOOLEAN_FEATURE_KEYS) {
        const minimum = minimumPlanFromExpectedMatrix(featureKey);
        if (minimum) fallback.set(featureKey, minimum);
      }
      return fallback;
    }
    return buildMinimumPlanMap(matrix.plans, matrix.assignments);
  },
);

export async function getMinimumPlanForFeature(
  featureKey: FeatureKey | string,
): Promise<MinimumPlanInfo | null> {
  const map = await getFeatureMinimumPlanMap();
  const fromCatalog = map.get(String(featureKey));
  if (fromCatalog) return fromCatalog;
  if (isFeatureKey(featureKey)) {
    return minimumPlanFromExpectedMatrix(featureKey);
  }
  return null;
}

export async function lockSummaryForFeature(params: {
  featureKey: FeatureKey;
  currentPlanKey?: string | null;
  currentPlanName?: string | null;
}): Promise<FeatureLockSummary> {
  const minimumPlan = await getMinimumPlanForFeature(params.featureKey);
  return buildFeatureLockSummary({
    featureKey: params.featureKey,
    currentPlanKey: params.currentPlanKey,
    currentPlanName: params.currentPlanName,
    minimumPlan,
  });
}

export function buildPlanComparison(params: {
  plans: SubscriptionPlanRecord[];
  features: FeatureRecord[];
  assignments: PlanFeatureAssignment[];
  customerVisibleOnly?: boolean;
}): PlanComparisonRow[] {
  const features = params.features.filter((feature) => {
    if (feature.status && feature.status !== "active") return false;
    if (params.customerVisibleOnly !== false && !feature.is_customer_visible) {
      return false;
    }
    return true;
  });

  const byPlanAndFeature = new Map<string, PlanFeatureAssignment>();
  for (const assignment of params.assignments) {
    byPlanAndFeature.set(
      `${assignment.plan_id}:${assignment.feature_key}`,
      assignment,
    );
  }

  return features
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .map((feature) => {
      const cells: Record<string, PlanComparisonCell> = {};
      for (const plan of params.plans) {
        const assignment = byPlanAndFeature.get(
          `${plan.id}:${feature.feature_key}`,
        );
        if (!assignment) {
          cells[String(plan.plan_key)] = {
            included: false,
            limit: 0,
            unlimited: false,
          };
          continue;
        }
        if (assignment.value_type === "integer") {
          const unlimited =
            assignment.integer_value === null ||
            assignment.integer_value === undefined;
          cells[String(plan.plan_key)] = {
            included: unlimited || (assignment.integer_value ?? 0) > 0,
            limit: unlimited ? null : Number(assignment.integer_value),
            unlimited,
          };
          continue;
        }
        cells[String(plan.plan_key)] = {
          included: assignmentEnabled(assignment),
          limit: assignment.integer_value,
          unlimited: false,
        };
      }
      const featureKey = String(feature.feature_key);
      return {
        featureKey,
        displayName: customerFacingFeatureName(feature),
        description: feature.description,
        helperText: isFeatureKey(featureKey)
          ? FEATURE_CUSTOMER_HELP[featureKey] ?? null
          : null,
        category: feature.category,
        valueType: feature.value_type,
        cells,
      };
    });
}

export const getPlanComparison = cache(async (): Promise<{
  plans: SubscriptionPlanRecord[];
  rows: PlanComparisonRow[];
}> => {
  const matrix = await listPlanFeatureMatrix();
  const features =
    matrix.features.length > 0 ? matrix.features : await listFeatures();
  return {
    plans: matrix.plans,
    rows: buildPlanComparison({
      plans: matrix.plans,
      features,
      assignments: matrix.assignments,
    }),
  };
});

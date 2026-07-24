import { cache } from "react";
import {
  EntitlementError,
  limitMessageForFeature,
  upgradeMessageForFeature,
} from "@/lib/subscriptions/errors";
import {
  buildEntitlementMap,
  evaluateFeatureCapacity,
  readBooleanEntitlement,
  readIntegerEntitlement,
} from "@/lib/subscriptions/entitlement-values";
import {
  FEATURE_DISPLAY_NAMES,
  isFeatureKey,
  type FeatureKey,
} from "@/lib/subscriptions/feature-keys";
import {
  getChurchSubscription,
  getDefaultSubscriptionPlan,
  getSubscriptionPlanByKey,
  listPlanFeatureAssignments,
} from "@/lib/subscriptions/queries";
import type {
  ChurchEntitlements,
  FeatureAccessResult,
  FeatureCapacityResult,
  FeatureLimitResult,
  SubscriptionPlanRecord,
} from "@/lib/subscriptions/types";

async function loadPlanEntitlements(
  plan: SubscriptionPlanRecord,
): Promise<ChurchEntitlements["values"]> {
  const assignments = await listPlanFeatureAssignments(plan.id);
  return buildEntitlementMap(assignments);
}

/**
 * Resolve effective entitlements for a plan id/key from plan_features.
 * Does not recurse inheritance — seed stores effective values.
 */
export async function getPlanEntitlements(params: {
  planId?: string;
  planKey?: string;
}): Promise<{
  plan: SubscriptionPlanRecord | null;
  values: ChurchEntitlements["values"];
}> {
  const { listSubscriptionPlans } = await import(
    "@/lib/subscriptions/queries"
  );

  let plan: SubscriptionPlanRecord | null = null;
  if (params.planKey) {
    plan = await getSubscriptionPlanByKey(params.planKey);
  } else if (params.planId) {
    const plans = await listSubscriptionPlans();
    plan = plans.find((item) => item.id === params.planId) ?? null;
  }

  if (!plan) {
    return { plan: null, values: {} };
  }

  return {
    plan,
    values: await loadPlanEntitlements(plan),
  };
}

/**
 * Resolve entitlements for a church.
 * If no current subscription exists, falls back to the default plan
 * (Servant Standard) and sets usedDefaultPlanFallback. Phase 4 should
 * assign real church_subscriptions rows.
 */
export const getChurchEntitlements = cache(
  async (churchId: string): Promise<ChurchEntitlements> => {
    const trimmed = churchId.trim();
    if (!trimmed) {
      return {
        churchId: "",
        subscription: null,
        plan: null,
        usedDefaultPlanFallback: true,
        values: {},
      };
    }

    const subscription = await getChurchSubscription(trimmed);
    if (subscription) {
      const plan = await getSubscriptionPlanByKey(String(subscription.plan_key));
      const resolvedPlan =
        plan ??
        ({
          id: subscription.plan_id,
          plan_key: subscription.plan_key,
          display_name: subscription.plan_display_name,
          description: null,
          status: "active",
          billing_interval: subscription.billing_interval,
          monthly_price_cents: null,
          currency: "USD",
          sort_order: 0,
          is_public: true,
          is_default: false,
          is_custom: false,
        } satisfies SubscriptionPlanRecord);

      return {
        churchId: trimmed,
        subscription,
        plan: resolvedPlan,
        usedDefaultPlanFallback: false,
        values: await loadPlanEntitlements(resolvedPlan),
      };
    }

    const defaultPlan = await getDefaultSubscriptionPlan();
    if (!defaultPlan) {
      return {
        churchId: trimmed,
        subscription: null,
        plan: null,
        usedDefaultPlanFallback: true,
        values: {},
      };
    }

    return {
      churchId: trimmed,
      subscription: null,
      plan: defaultPlan,
      usedDefaultPlanFallback: true,
      values: await loadPlanEntitlements(defaultPlan),
    };
  },
);

export async function hasFeature(params: {
  churchId: string;
  featureKey: FeatureKey | string;
}): Promise<FeatureAccessResult> {
  const featureKey = String(params.featureKey);
  if (!isFeatureKey(featureKey)) {
    return {
      allowed: false,
      featureKey: featureKey as FeatureKey,
      planKey: null,
      planDisplayName: null,
      reason: "Unknown feature.",
    };
  }

  const entitlements = await getChurchEntitlements(params.churchId);
  const allowed = readBooleanEntitlement(entitlements.values, featureKey);

  return {
    allowed,
    featureKey,
    planKey: entitlements.plan ? String(entitlements.plan.plan_key) : null,
    planDisplayName: entitlements.plan?.display_name ?? null,
    reason: allowed
      ? undefined
      : upgradeMessageForFeature(
          featureKey,
          entitlements.plan?.display_name ?? null,
        ),
  };
}

export async function getFeatureLimit(params: {
  churchId: string;
  featureKey: FeatureKey | string;
}): Promise<FeatureLimitResult> {
  const featureKey = String(params.featureKey);
  if (!isFeatureKey(featureKey)) {
    return {
      featureKey: featureKey as FeatureKey,
      limit: 0,
      unlimited: false,
      planKey: null,
      planDisplayName: null,
    };
  }

  const entitlements = await getChurchEntitlements(params.churchId);
  const { limit, unlimited } = readIntegerEntitlement(
    entitlements.values,
    featureKey,
  );

  return {
    featureKey,
    limit,
    unlimited,
    planKey: entitlements.plan ? String(entitlements.plan.plan_key) : null,
    planDisplayName: entitlements.plan?.display_name ?? null,
  };
}

export async function requireFeature(params: {
  churchId: string;
  featureKey: FeatureKey | string;
}): Promise<void> {
  const result = await hasFeature(params);
  if (!result.allowed) {
    throw new EntitlementError(
      result.reason ??
        upgradeMessageForFeature(
          result.featureKey,
          result.planDisplayName,
        ),
      {
        code: isFeatureKey(String(params.featureKey))
          ? "feature_disabled"
          : "unknown_feature",
        featureKey: result.featureKey,
        planDisplayName: result.planDisplayName,
      },
    );
  }
}

export async function requireFeatureCapacity(params: {
  churchId: string;
  featureKey: FeatureKey | string;
  currentUsage: number;
  requestedIncrease?: number;
}): Promise<FeatureCapacityResult> {
  const featureKey = String(params.featureKey);
  if (!isFeatureKey(featureKey)) {
    throw new EntitlementError("Unknown feature.", {
      code: "unknown_feature",
      featureKey: featureKey as FeatureKey,
    });
  }

  const requestedIncrease = Math.max(0, params.requestedIncrease ?? 1);
  const currentUsage = Math.max(0, params.currentUsage);
  const limitResult = await getFeatureLimit({
    churchId: params.churchId,
    featureKey,
  });

  const capacity = evaluateFeatureCapacity({
    limit: limitResult.limit,
    unlimited: limitResult.unlimited,
    currentUsage,
    requestedIncrease,
  });

  const result: FeatureCapacityResult = {
    allowed: capacity.allowed,
    featureKey,
    limit: limitResult.limit,
    unlimited: limitResult.unlimited,
    currentUsage,
    requestedIncrease,
    remaining: capacity.remaining,
    planKey: limitResult.planKey,
    planDisplayName: limitResult.planDisplayName,
    reason: capacity.allowed
      ? undefined
      : limitMessageForFeature(
          featureKey,
          limitResult.limit ?? 0,
          limitResult.planDisplayName,
        ),
  };

  if (!result.allowed) {
    throw new EntitlementError(
      result.reason ??
        `Your plan limit for ${FEATURE_DISPLAY_NAMES[featureKey]} has been reached.`,
      {
        code: "limit_exceeded",
        featureKey,
        planDisplayName: limitResult.planDisplayName,
      },
    );
  }

  return result;
}

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMinimumPlanForFeature } from "@/lib/subscriptions/catalog";
import {
  buildEntitlementMap,
  evaluateFeatureCapacity,
  readBooleanEntitlement,
  readIntegerEntitlement,
} from "@/lib/subscriptions/entitlement-values";
import {
  EntitlementError,
  limitMessageForFeature,
  upgradeMessageForFeature,
} from "@/lib/subscriptions/errors";
import {
  FEATURE_ACCESS_REASONS,
  buildUpgradeCopy,
} from "@/lib/subscriptions/feature-access";
import {
  FEATURE_DISPLAY_NAMES,
  isFeatureKey,
  type FeatureKey,
} from "@/lib/subscriptions/feature-keys";
import {
  loadActiveEntitlementOverrides,
  mergeEntitlementValues,
} from "@/lib/subscriptions/overrides";
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
 * (Servant Standard) and sets usedDefaultPlanFallback.
 * Active platform overrides overlay plan_features for that organization only.
 *
 * Pass a service-role client when the caller is not yet a member (invite
 * accept). Member-scoped RLS hides organization_subscriptions from invitees,
 * which would otherwise fall back to Servant Standard and block valid joins.
 */
export async function loadChurchEntitlements(
  organizationId: string,
  client?: SupabaseClient,
): Promise<ChurchEntitlements> {
  const trimmed = organizationId.trim();
  if (!trimmed) {
    return {
      organizationId: "",
      subscription: null,
      plan: null,
      usedDefaultPlanFallback: true,
      values: {},
    };
  }

  const subscription = await getChurchSubscription(trimmed, client);
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
      organizationId: trimmed,
      subscription,
      plan: resolvedPlan,
      usedDefaultPlanFallback: false,
      values: mergeEntitlementValues(
        await loadPlanEntitlements(resolvedPlan),
        await loadActiveEntitlementOverrides(trimmed, client),
      ),
    };
  }

  const defaultPlan = await getDefaultSubscriptionPlan();
  if (!defaultPlan) {
    return {
      organizationId: trimmed,
      subscription: null,
      plan: null,
      usedDefaultPlanFallback: true,
      values: {},
    };
  }

  return {
    organizationId: trimmed,
    subscription: null,
    plan: defaultPlan,
    usedDefaultPlanFallback: true,
    values: mergeEntitlementValues(
      await loadPlanEntitlements(defaultPlan),
      await loadActiveEntitlementOverrides(trimmed, client),
    ),
  };
}

export const getChurchEntitlements = cache(async (organizationId: string) =>
  loadChurchEntitlements(organizationId),
);

export async function hasFeature(params: {
  organizationId: string;
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
      reasonCode: FEATURE_ACCESS_REASONS.UNKNOWN_FEATURE,
      minimumPlanKey: null,
      minimumPlanDisplayName: null,
      upgradeMessage: "Unknown feature.",
    };
  }

  const entitlements = await getChurchEntitlements(params.organizationId);
  const allowed = readBooleanEntitlement(entitlements.values, featureKey);
  const planKey = entitlements.plan ? String(entitlements.plan.plan_key) : null;
  const planDisplayName = entitlements.plan?.display_name ?? null;
  const minimumPlan = allowed
    ? null
    : await getMinimumPlanForFeature(featureKey);
  const upgradeMessage = allowed
    ? undefined
    : upgradeMessageForFeature(
        featureKey,
        planDisplayName,
        minimumPlan?.displayName,
      );
  const copy = allowed
    ? null
    : buildUpgradeCopy({
        featureKey,
        currentPlanName: planDisplayName,
        minimumPlanName: minimumPlan?.displayName,
      });

  return {
    allowed,
    featureKey,
    planKey,
    planDisplayName,
    reason: allowed ? undefined : copy?.longMessage ?? upgradeMessage,
    reasonCode: allowed
      ? FEATURE_ACCESS_REASONS.AVAILABLE
      : minimumPlan
        ? FEATURE_ACCESS_REASONS.TIER_REQUIRED
        : FEATURE_ACCESS_REASONS.FEATURE_DISABLED,
    minimumPlanKey: minimumPlan?.planKey ?? null,
    minimumPlanDisplayName: minimumPlan?.displayName ?? null,
    upgradeMessage,
  };
}

export async function getFeatureEntitlement(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
}): Promise<FeatureAccessResult> {
  return hasFeature(params);
}

export async function getFeatureLimit(params: {
  organizationId: string;
  featureKey: FeatureKey | string;
  client?: SupabaseClient;
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

  const entitlements = params.client
    ? await loadChurchEntitlements(params.organizationId, params.client)
    : await getChurchEntitlements(params.organizationId);
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
  organizationId: string;
  featureKey: FeatureKey | string;
}): Promise<void> {
  const result = await hasFeature(params);
  if (!result.allowed) {
    throw new EntitlementError(
      result.reason ??
        upgradeMessageForFeature(
          result.featureKey,
          result.planDisplayName,
          result.minimumPlanDisplayName,
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
  organizationId: string;
  featureKey: FeatureKey | string;
  currentUsage: number;
  requestedIncrease?: number;
  client?: SupabaseClient;
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
    organizationId: params.organizationId,
    featureKey,
    client: params.client,
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
          currentUsage,
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

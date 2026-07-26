import {
  FEATURE_DISPLAY_NAMES,
  isFeatureKey,
  type FeatureKey,
} from "@/lib/subscriptions/feature-keys";
import { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";
import {
  PLAN_DISPLAY_NAMES,
  PLAN_KEY_LIST,
  type PlanKey,
} from "@/lib/subscriptions/plan-keys";
import type { HelpFeatureNotice } from "@/lib/help/types";

function planIncludesBooleanFeature(
  planKey: PlanKey,
  featureKey: FeatureKey,
): boolean {
  const value = EXPECTED_PLAN_ENTITLEMENTS[planKey]?.[featureKey];
  return value === true;
}

/**
 * Pure plan/feature notice builder for Help articles.
 * Prefer live `hasFeature` for `included` when a church context is available;
 * plan name lists use the expected matrix as a display fallback (runtime may
 * later load plan_features from the database).
 */
export function buildHelpFeatureNotice(params: {
  featureKey: string;
  included: boolean;
  planKeysOverride?: readonly string[] | null;
}): HelpFeatureNotice | null {
  const featureKey = params.featureKey.trim();
  if (!featureKey) return null;

  const feature_label = isFeatureKey(featureKey)
    ? FEATURE_DISPLAY_NAMES[featureKey]
    : featureKey;

  const plan_keys_with_feature = (
    params.planKeysOverride?.length
      ? params.planKeysOverride.filter((key): key is PlanKey =>
          (PLAN_KEY_LIST as readonly string[]).includes(key),
        )
      : isFeatureKey(featureKey)
        ? PLAN_KEY_LIST.filter((planKey) =>
            planIncludesBooleanFeature(planKey, featureKey),
          )
        : []
  ) as PlanKey[];

  const plan_display_names = plan_keys_with_feature.map(
    (key) => PLAN_DISPLAY_NAMES[key],
  );

  const message = params.included
    ? `${feature_label} is included in your plan.`
    : plan_display_names.length > 0
      ? `${feature_label} is available with ${plan_display_names.join(", ")}.`
      : `${feature_label} is not included in your current plan.`;

  return {
    feature_key: featureKey,
    feature_label,
    included: params.included,
    plan_keys_with_feature,
    plan_display_names,
    message,
  };
}

export function buildHelpFeatureNotices(params: {
  featureKeys: readonly string[];
  includedByFeatureKey: ReadonlyMap<string, boolean> | Record<string, boolean>;
  planKeysByFeatureKey?: ReadonlyMap<string, readonly string[]>;
}): HelpFeatureNotice[] {
  const includedMap =
    params.includedByFeatureKey instanceof Map
      ? params.includedByFeatureKey
      : new Map(Object.entries(params.includedByFeatureKey));

  const notices: HelpFeatureNotice[] = [];
  for (const featureKey of params.featureKeys) {
    const notice = buildHelpFeatureNotice({
      featureKey,
      included: includedMap.get(featureKey) === true,
      planKeysOverride: params.planKeysByFeatureKey?.get(featureKey) ?? null,
    });
    if (notice) notices.push(notice);
  }
  return notices;
}

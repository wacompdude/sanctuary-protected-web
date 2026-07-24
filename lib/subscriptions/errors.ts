import type { FeatureKey } from "@/lib/subscriptions/feature-keys";
import { FEATURE_DISPLAY_NAMES } from "@/lib/subscriptions/feature-keys";

export class EntitlementError extends Error {
  readonly code:
    | "feature_disabled"
    | "limit_exceeded"
    | "subscription_unavailable"
    | "unknown_feature";
  readonly featureKey?: FeatureKey;
  readonly planDisplayName?: string | null;

  constructor(
    message: string,
    options: {
      code: EntitlementError["code"];
      featureKey?: FeatureKey;
      planDisplayName?: string | null;
    },
  ) {
    super(message);
    this.name = "EntitlementError";
    this.code = options.code;
    this.featureKey = options.featureKey;
    this.planDisplayName = options.planDisplayName ?? null;
  }
}

export function upgradeMessageForFeature(
  featureKey: FeatureKey,
  planDisplayName?: string | null,
): string {
  const label = FEATURE_DISPLAY_NAMES[featureKey] ?? "This feature";
  const plan = planDisplayName?.trim();
  if (plan) {
    return `${label} is not included in your ${plan} plan. Upgrade to unlock it.`;
  }
  return `${label} is not available on your current plan. Upgrade to unlock it.`;
}

export function limitMessageForFeature(
  featureKey: FeatureKey,
  limit: number,
  planDisplayName?: string | null,
): string {
  const label = FEATURE_DISPLAY_NAMES[featureKey] ?? "This limit";
  const plan = planDisplayName?.trim();
  if (plan) {
    return `Your ${plan} plan supports up to ${limit} for ${label.toLowerCase()}.`;
  }
  return `Your plan supports up to ${limit} for ${label.toLowerCase()}.`;
}

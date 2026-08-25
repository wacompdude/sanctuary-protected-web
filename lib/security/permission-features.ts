import { FEATURE_KEYS, type FeatureKey } from "@/lib/subscriptions/feature-keys";

/**
 * Map security permission keys to subscription feature keys.
 *
 * Permission `minimum_tier` values are informational catalog hints and can
 * drift from plan_features. Authorization must use the Feature Catalog, not
 * those plan-key strings.
 */
export function featureKeyForPermission(
  permissionKey: string,
): FeatureKey | null {
  const key = permissionKey.trim();
  if (key.startsWith("cameras.")) return FEATURE_KEYS.CAMERAS;
  if (key.startsWith("training.")) return FEATURE_KEYS.TRAINING_MANAGEMENT;
  if (key.startsWith("policies.")) return FEATURE_KEYS.POLICIES;
  if (key.startsWith("equipment.")) return FEATURE_KEYS.HARDWARE_INVENTORY;
  if (key.startsWith("safety_concerns.") || key.startsWith("safety-concerns.")) {
    return FEATURE_KEYS.SAFETY_CONCERN_PROFILES;
  }
  return null;
}

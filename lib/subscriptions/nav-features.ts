import { FEATURE_KEYS, type FeatureKey } from "@/lib/subscriptions/feature-keys";

/** Nav item ids that require a boolean entitlement to appear. */
export const NAV_FEATURE_REQUIREMENTS: Partial<Record<string, FeatureKey>> = {
  policies: FEATURE_KEYS.POLICIES,
  "medical-supplies": FEATURE_KEYS.MEDICAL_INVENTORY,
  "security-hardware": FEATURE_KEYS.HARDWARE_INVENTORY,
  schedule: FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-calendar": FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-events": FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-shifts": FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-availability": FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-my": FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-notifications": FEATURE_KEYS.TEAM_SCHEDULING,
  "schedule-templates": FEATURE_KEYS.TEAM_SCHEDULING,
  "scheduling-settings": FEATURE_KEYS.TEAM_SCHEDULING,
};

export const NAV_ENTITLEMENT_FEATURE_KEYS: FeatureKey[] = [
  ...new Set(Object.values(NAV_FEATURE_REQUIREMENTS).filter(Boolean)),
] as FeatureKey[];

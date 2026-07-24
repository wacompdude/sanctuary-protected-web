import type { FeatureKey } from "@/lib/subscriptions/feature-keys";
import { FEATURE_KEYS, isFeatureKey } from "@/lib/subscriptions/feature-keys";
import type {
  EntitlementValue,
  PlanFeatureAssignment,
} from "@/lib/subscriptions/types";

export function entitlementFromAssignment(
  assignment: PlanFeatureAssignment,
): EntitlementValue {
  switch (assignment.value_type) {
    case "boolean":
      return {
        kind: "boolean",
        value: Boolean(assignment.boolean_value),
      };
    case "integer":
      return {
        kind: "integer",
        value:
          assignment.integer_value === null ||
          assignment.integer_value === undefined
            ? null
            : Number(assignment.integer_value),
      };
    case "decimal":
      return {
        kind: "decimal",
        value:
          assignment.decimal_value === null ||
          assignment.decimal_value === undefined
            ? null
            : Number(assignment.decimal_value),
      };
    case "text":
      return { kind: "text", value: assignment.text_value };
    case "json":
      return { kind: "json", value: assignment.json_value };
    default:
      return { kind: "missing", value: null };
  }
}

export function buildEntitlementMap(
  assignments: PlanFeatureAssignment[],
): Record<string, EntitlementValue> {
  const values: Record<string, EntitlementValue> = {};
  for (const assignment of assignments) {
    const key = String(assignment.feature_key);
    if (!isFeatureKey(key) && process.env.NODE_ENV === "development") {
      console.warn(
        `[subscriptions] Ignoring unknown feature_key “${key}” in plan assignment`,
      );
    }
    values[key] = entitlementFromAssignment(assignment);
  }
  return values;
}

export function readBooleanEntitlement(
  values: Record<string, EntitlementValue>,
  featureKey: FeatureKey,
): boolean {
  const entry = values[featureKey];
  if (!entry || entry.kind === "missing") return false;
  if (entry.kind !== "boolean") return false;
  return entry.value === true;
}

/**
 * Integer limits: null means unlimited (e.g. campuses.maximum_count on
 * Shepherd Plus). Missing or non-integer values fail closed as 0.
 */
export function readIntegerEntitlement(
  values: Record<string, EntitlementValue>,
  featureKey: FeatureKey,
): { limit: number | null; unlimited: boolean } {
  const entry = values[featureKey];
  if (!entry || entry.kind === "missing") {
    return { limit: 0, unlimited: false };
  }
  if (entry.kind !== "integer") {
    return { limit: 0, unlimited: false };
  }
  if (entry.value === null) {
    return { limit: null, unlimited: true };
  }
  return { limit: entry.value, unlimited: false };
}

/** Features that are boolean gates (not numeric limits). */
export const BOOLEAN_FEATURE_KEYS: readonly FeatureKey[] = [
  FEATURE_KEYS.INCIDENT_LOGGING,
  FEATURE_KEYS.INCIDENT_PHOTOS,
  FEATURE_KEYS.GROUP_EMAIL,
  FEATURE_KEYS.EMAIL,
  FEATURE_KEYS.SMS,
  FEATURE_KEYS.TEAM_SCHEDULING,
  FEATURE_KEYS.MEDICAL_INVENTORY,
  FEATURE_KEYS.MEDICAL_INCIDENT_USAGE,
  FEATURE_KEYS.HARDWARE_INVENTORY,
  FEATURE_KEYS.HARDWARE_PHOTOS,
  FEATURE_KEYS.POLICIES,
  FEATURE_KEYS.STANDARD_ANALYTICS,
  FEATURE_KEYS.ADVANCED_ANALYTICS,
  FEATURE_KEYS.MULTI_CAMPUS,
  FEATURE_KEYS.CAMERAS,
  FEATURE_KEYS.SENSORS,
  FEATURE_KEYS.SENSOR_ALARMS,
];

export const INTEGER_FEATURE_KEYS: readonly FeatureKey[] = [
  FEATURE_KEYS.USERS_ACTIVE_LIMIT,
  FEATURE_KEYS.INCIDENT_PHOTO_COUNT_LIMIT,
  FEATURE_KEYS.INCIDENT_PHOTO_SIZE_LIMIT_MB,
  FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT,
  FEATURE_KEYS.CAMPUS_LIMIT,
];

/** Pure helper for capacity checks and unit self-checks. */
export function evaluateFeatureCapacity(params: {
  limit: number | null;
  unlimited: boolean;
  currentUsage: number;
  requestedIncrease?: number;
}): { allowed: boolean; remaining: number | null; projected: number } {
  const requestedIncrease = Math.max(0, params.requestedIncrease ?? 1);
  const currentUsage = Math.max(0, params.currentUsage);
  const projected = currentUsage + requestedIncrease;
  if (params.unlimited || params.limit === null) {
    return { allowed: true, remaining: null, projected };
  }
  const remaining = Math.max(0, params.limit - currentUsage);
  return {
    allowed: projected <= params.limit,
    remaining,
    projected,
  };
}

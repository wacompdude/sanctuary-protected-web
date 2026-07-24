import {
  buildEntitlementMap,
  readBooleanEntitlement,
  readIntegerEntitlement,
} from "@/lib/subscriptions/entitlement-values";
import { FEATURE_KEY_LIST, FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";
import { PLAN_KEY_LIST, PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import { evaluateFeatureCapacity } from "@/lib/subscriptions/entitlement-values";
import type { PlanFeatureAssignment } from "@/lib/subscriptions/types";

/**
 * Phase 3 entitlement self-check (no database required).
 * Run: npx --yes tsx lib/subscriptions/entitlements.selfcheck.ts
 */
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(FEATURE_KEY_LIST.length === 22, "expected 22 feature keys");
assert(PLAN_KEY_LIST.length === 4, "expected 4 plan keys");

function assignment(
  featureKey: string,
  valueType: PlanFeatureAssignment["value_type"],
  value: boolean | number | null,
): PlanFeatureAssignment {
  return {
    plan_id: "plan",
    feature_id: featureKey,
    feature_key: featureKey,
    value_type: valueType,
    boolean_value: typeof value === "boolean" ? value : null,
    integer_value: typeof value === "number" || value === null ? value : null,
    decimal_value: null,
    text_value: null,
    json_value: null,
    is_inherited: false,
  };
}

for (const planKey of PLAN_KEY_LIST) {
  const expected = EXPECTED_PLAN_ENTITLEMENTS[planKey];
  const rows: PlanFeatureAssignment[] = Object.entries(expected).map(
    ([featureKey, value]) => {
      if (typeof value === "boolean") {
        return assignment(featureKey, "boolean", value);
      }
      return assignment(featureKey, "integer", value as number | null);
    },
  );

  const values = buildEntitlementMap(rows);

  assert(
    readBooleanEntitlement(values, FEATURE_KEYS.INCIDENT_LOGGING) === true,
    `${planKey} should include incident logging`,
  );

  if (planKey === PLAN_KEYS.SERVANT_STANDARD) {
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.INCIDENT_PHOTOS) === false,
      "Servant Standard cannot use incident photos",
    );
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.MEDICAL_INVENTORY) === false,
      "Servant Standard cannot use medical inventory",
    );
    assert(
      readIntegerEntitlement(values, FEATURE_KEYS.USERS_ACTIVE_LIMIT).limit ===
        10,
      "Servant Standard user limit is 10",
    );
  }

  if (planKey === PLAN_KEYS.STEWARD_PRO) {
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.INCIDENT_PHOTOS) === true,
      "Steward Pro can use incident photos",
    );
    assert(
      readIntegerEntitlement(values, FEATURE_KEYS.INCIDENT_PHOTO_COUNT_LIMIT)
        .limit === 2,
      "Steward Pro photo count is 2",
    );
    assert(
      readIntegerEntitlement(values, FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT)
        .limit === 250,
      "Steward Pro SMS limit is 250",
    );
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.POLICIES) === false,
      "Steward Pro cannot use policies",
    );
  }

  if (planKey === PLAN_KEYS.SHEPHERD_PLUS) {
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.POLICIES) === true,
      "Shepherd Plus can use policies",
    );
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.MULTI_CAMPUS) === true,
      "Shepherd Plus has multi-campus",
    );
    const campus = readIntegerEntitlement(values, FEATURE_KEYS.CAMPUS_LIMIT);
    assert(campus.unlimited === true, "Shepherd Plus campus limit is unlimited");
    assert(
      readIntegerEntitlement(values, FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT)
        .limit === 1000,
      "Shepherd Plus SMS limit is 1000",
    );
  }

  if (planKey === PLAN_KEYS.OMNI_ENTERPRISE) {
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.CAMERAS) === true,
      "Omni Enterprise has cameras",
    );
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.SENSORS) === true,
      "Omni Enterprise has sensors",
    );
    assert(
      readBooleanEntitlement(values, FEATURE_KEYS.SENSOR_ALARMS) === true,
      "Omni Enterprise has sensor alarms",
    );
  }
}

// Capacity helper
assert(
  evaluateFeatureCapacity({
    limit: 10,
    unlimited: false,
    currentUsage: 10,
    requestedIncrease: 1,
  }).allowed === false,
  "11th user blocked at limit 10",
);
assert(
  evaluateFeatureCapacity({
    limit: 10,
    unlimited: false,
    currentUsage: 9,
    requestedIncrease: 1,
  }).allowed === true,
  "10th user allowed at limit 10",
);
assert(
  evaluateFeatureCapacity({
    limit: null,
    unlimited: true,
    currentUsage: 1000,
    requestedIncrease: 50,
  }).allowed === true,
  "unlimited campus capacity allows growth",
);

// Fail-closed missing feature
assert(
  readBooleanEntitlement({}, FEATURE_KEYS.POLICIES) === false,
  "missing boolean entitlement fails closed",
);
assert(
  readIntegerEntitlement({}, FEATURE_KEYS.USERS_ACTIVE_LIMIT).limit === 0,
  "missing integer entitlement fails closed to 0",
);

console.log("subscription entitlements self-check passed");

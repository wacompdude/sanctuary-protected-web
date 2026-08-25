/**
 * Feature access / locked-nav self-check (no database required).
 * Run: npx --yes tsx lib/subscriptions/feature-access.selfcheck.ts
 */
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import {
  APP_NAV_SECTIONS,
  getNavSectionsForRole,
} from "@/lib/organization/navigation";
import { applyNavFeatureLocks } from "@/lib/subscriptions/nav-locks";
import {
  buildUpgradeCopy,
  minimumPlanFromExpectedMatrix,
} from "@/lib/subscriptions/feature-access";
import { buildPlanComparison } from "@/lib/subscriptions/catalog";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import { featureKeyForPermission } from "@/lib/security/permission-features";
import { mergeEntitlementValues } from "@/lib/subscriptions/overrides";
import { upgradeMessageForFeature } from "@/lib/subscriptions/errors";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  minimumPlanFromExpectedMatrix(FEATURE_KEYS.TRAINING_MANAGEMENT)?.planKey ===
    PLAN_KEYS.STEWARD_PRO,
  "training minimum plan is Steward Pro",
);
assert(
  minimumPlanFromExpectedMatrix(FEATURE_KEYS.POLICIES)?.planKey ===
    PLAN_KEYS.SHEPHERD_PLUS,
  "policies minimum plan is Shepherd Plus",
);
assert(
  minimumPlanFromExpectedMatrix(FEATURE_KEYS.CAMERAS)?.planKey ===
    PLAN_KEYS.OMNI_ENTERPRISE,
  "cameras minimum plan is Omni Enterprise",
);
assert(
  minimumPlanFromExpectedMatrix(FEATURE_KEYS.INCIDENT_LOGGING)?.planKey ===
    PLAN_KEYS.SERVANT_STANDARD,
  "incident logging is on Servant Standard",
);

const copy = buildUpgradeCopy({
  featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
  currentPlanName: "Servant Standard",
  minimumPlanName: "Steward Pro",
});
assert(
  copy.shortMessage.includes("Steward Pro"),
  "upgrade short message names minimum plan",
);
assert(
  copy.accessibleDescription.includes("unavailable"),
  "accessible description explains locked state",
);
assert(
  upgradeMessageForFeature(
    FEATURE_KEYS.TRAINING_MANAGEMENT,
    "Servant Standard",
    "Steward Pro",
  ).includes("Steward Pro"),
  "upgradeMessageForFeature names minimum plan",
);

const locked = applyNavFeatureLocks(APP_NAV_SECTIONS, {
  enabledFeatures: new Set([
    FEATURE_KEYS.TEAM_SCHEDULING,
    FEATURE_KEYS.INCIDENT_LOGGING,
  ]),
});
const operations = locked.find((section) => section.id === "operations");
const policies = operations?.items.find(
  (item) => item.kind === "link" && item.id === "policies",
);
assert(policies?.kind === "link", "policies remain visible");
assert(policies?.kind === "link" && policies.locked === true, "policies are locked");
assert(
  policies?.kind === "link" && policies.featureKey === FEATURE_KEYS.POLICIES,
  "locked policies expose feature key",
);

const trainingGroup = locked
  .find((section) => section.id === "people")
  ?.items.find((item) => item.kind === "group" && item.id === "training");
assert(trainingGroup?.kind === "group", "training group stays visible");
if (trainingGroup?.kind === "group") {
  const dashboard = trainingGroup.children.find(
    (child) => child.id === "training-dashboard",
  );
  const certifications = trainingGroup.children.find(
    (child) => child.id === "certifications",
  );
  assert(dashboard?.locked === true, "training dashboard is locked");
  assert(certifications?.locked !== true, "certifications stay available");
}

const servantNav = getNavSectionsForRole("security_member", {
  enabledFeatures: new Set(),
});
const allLabels: string[] = [];
for (const section of servantNav) {
  for (const entry of section.items) {
    if (entry.kind === "link") allLabels.push(entry.label);
    else {
      allLabels.push(entry.label);
      for (const child of entry.children) allLabels.push(child.label);
    }
  }
}
assert(allLabels.includes("Policies & Procedures"), "locked module is not hidden");
assert(allLabels.includes("Training"), "training group is not hidden");
assert(allLabels.includes("Cameras"), "cameras remain visible when locked");

const comparison = buildPlanComparison({
  plans: [
    {
      id: "p1",
      plan_key: PLAN_KEYS.SERVANT_STANDARD,
      display_name: "Servant Standard",
      description: null,
      status: "active",
      billing_interval: "month",
      monthly_price_cents: 0,
      currency: "USD",
      sort_order: 10,
      is_public: true,
      is_default: true,
      is_custom: false,
    },
    {
      id: "p2",
      plan_key: PLAN_KEYS.STEWARD_PRO,
      display_name: "Steward Pro",
      description: null,
      status: "active",
      billing_interval: "month",
      monthly_price_cents: 0,
      currency: "USD",
      sort_order: 20,
      is_public: true,
      is_default: false,
      is_custom: false,
    },
  ],
  features: [
    {
      id: "f1",
      feature_key: FEATURE_KEYS.TRAINING_MANAGEMENT,
      display_name: "Training Management",
      description: null,
      category: "training",
      value_type: "boolean",
      unit: null,
      status: "active",
      is_customer_visible: true,
    },
  ],
  assignments: [
    {
      plan_id: "p1",
      feature_id: "f1",
      feature_key: FEATURE_KEYS.TRAINING_MANAGEMENT,
      value_type: "boolean",
      boolean_value: false,
      integer_value: null,
      decimal_value: null,
      text_value: null,
      json_value: null,
      is_inherited: false,
    },
    {
      plan_id: "p2",
      feature_id: "f1",
      feature_key: FEATURE_KEYS.TRAINING_MANAGEMENT,
      value_type: "boolean",
      boolean_value: true,
      integer_value: null,
      decimal_value: null,
      text_value: null,
      json_value: null,
      is_inherited: false,
    },
  ],
});
assert(comparison.length === 1, "comparison has one customer-visible row");
assert(
  comparison[0]?.cells[PLAN_KEYS.SERVANT_STANDARD]?.included === false,
  "comparison servant training locked",
);
assert(
  comparison[0]?.cells[PLAN_KEYS.STEWARD_PRO]?.included === true,
  "comparison steward training included",
);

assert(
  featureKeyForPermission("training.manage") === FEATURE_KEYS.TRAINING_MANAGEMENT,
  "training permissions map to training feature",
);
assert(
  featureKeyForPermission("cameras.view_live") === FEATURE_KEYS.CAMERAS,
  "camera permissions map to cameras feature",
);
assert(
  featureKeyForPermission("incidents.create") === null,
  "incident permissions are not remapped to a higher-tier feature",
);

const merged = mergeEntitlementValues(
  {
    [FEATURE_KEYS.CAMERAS]: { kind: "boolean", value: false },
  },
  {
    [FEATURE_KEYS.CAMERAS]: { kind: "boolean", value: true },
  },
);
assert(
  merged[FEATURE_KEYS.CAMERAS]?.kind === "boolean" &&
    merged[FEATURE_KEYS.CAMERAS].value === true,
  "organization override can force-enable a feature",
);

console.log("subscription feature-access self-check passed");

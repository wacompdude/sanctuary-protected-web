/**
 * Access-granting entitlement resolution (no database, no Stripe).
 * Run: npx --yes tsx lib/subscriptions/entitlement-access.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import {
  readBooleanEntitlement,
  readIntegerEntitlement,
} from "@/lib/subscriptions/entitlement-values";
import { resolveChurchEntitlementSource } from "@/lib/subscriptions/entitlement-resolution";
import { loadChurchEntitlements } from "@/lib/subscriptions/resolver";
import { getChurchSubscription } from "@/lib/subscriptions/queries";
import { ACCESS_GRANTING_STATUSES } from "@/lib/subscriptions/status";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ORG = "org-entitlement";

const PLANS = {
  servant_standard: {
    id: "plan-servant",
    plan_key: "servant_standard",
    display_name: "Servant Standard",
    description: null,
    status: "active",
    billing_interval: "month",
    monthly_price_cents: 0,
    currency: "USD",
    sort_order: 1,
    is_public: true,
    is_default: true,
    is_custom: false,
  },
  steward_pro: {
    id: "plan-steward",
    plan_key: "steward_pro",
    display_name: "Steward Pro",
    description: null,
    status: "active",
    billing_interval: "month",
    monthly_price_cents: 3995,
    currency: "USD",
    sort_order: 2,
    is_public: true,
    is_default: false,
    is_custom: false,
  },
  omni_enterprise: {
    id: "plan-omni",
    plan_key: "omni_enterprise",
    display_name: "Omni Enterprise",
    description: null,
    status: "active",
    billing_interval: "month",
    monthly_price_cents: 0,
    currency: "USD",
    sort_order: 4,
    is_public: true,
    is_default: false,
    is_custom: false,
  },
} as const;

function assignment(
  planId: string,
  featureKey: string,
  value: boolean | number,
) {
  const booleanValue = typeof value === "boolean" ? value : null;
  const integerValue = typeof value === "number" ? value : null;
  return {
    plan_id: planId,
    feature_id: featureKey,
    boolean_value: booleanValue,
    integer_value: integerValue,
    decimal_value: null,
    text_value: null,
    json_value: null,
    is_inherited: false,
    features: {
      feature_key: featureKey,
      value_type: typeof value === "number" ? "integer" : "boolean",
    },
  };
}

const FEATURES: Record<string, ReturnType<typeof assignment>[]> = {
  "plan-servant": [
    assignment("plan-servant", FEATURE_KEYS.USERS_ACTIVE_LIMIT, 10),
    assignment("plan-servant", FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT, 0),
    assignment("plan-servant", FEATURE_KEYS.INCIDENT_ANALYTICS, false),
  ],
  "plan-steward": [
    assignment("plan-steward", FEATURE_KEYS.USERS_ACTIVE_LIMIT, 20),
    assignment("plan-steward", FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT, 250),
    assignment("plan-steward", FEATURE_KEYS.INCIDENT_ANALYTICS, true),
  ],
  "plan-omni": [
    assignment("plan-omni", FEATURE_KEYS.USERS_ACTIVE_LIMIT, 100),
    assignment("plan-omni", FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT, 1000),
    assignment("plan-omni", FEATURE_KEYS.INCIDENT_ANALYTICS, true),
  ],
};

function subscriptionRow(input: {
  status: string;
  planKey: keyof typeof PLANS;
  cancelAtPeriodEnd?: boolean;
}) {
  const plan = PLANS[input.planKey];
  return {
    id: "sub-row",
    organization_id: ORG,
    plan_id: plan.id,
    status: input.status,
    billing_interval: "month",
    billing_provider: "stripe",
    billing_subscription_id: "sub_test",
    current_period_start: "2026-10-08T00:00:00.000Z",
    current_period_end: "2026-11-08T00:00:00.000Z",
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
    cancelled_at: null,
    provider_schedule_id: null,
    scheduled_effective_at: null,
    schedule_status: null,
    trial_start: null,
    trial_end: null,
    grace_period_end: null,
    started_at: "2026-10-08T00:00:00.000Z",
    subscription_plans: {
      plan_key: plan.plan_key,
      display_name: plan.display_name,
    },
    scheduled_plan: null,
  };
}

function client(row: ReturnType<typeof subscriptionRow> | null) {
  return {
    from(table: string) {
      const eqs: Record<string, unknown> = {};
      let statusFilter: string[] | null = null;
      const builder = {
        select() {
          return builder;
        },
        eq(key: string, value: unknown) {
          eqs[key] = value;
          return builder;
        },
        in(_key: string, values: string[]) {
          statusFilter = values;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        is() {
          return builder;
        },
        async maybeSingle() {
          if (table === "organization_subscriptions") {
            if (!row) return { data: null, error: null };
            if (statusFilter && !statusFilter.includes(row.status)) {
              return { data: null, error: null };
            }
            return { data: row, error: null };
          }
          if (table === "subscription_plans") {
            if (eqs.is_default === true) {
              return { data: PLANS.servant_standard, error: null };
            }
            const plan = Object.values(PLANS).find(
              (item) => item.plan_key === eqs.plan_key,
            );
            return { data: plan ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: null }) => void,
          reject?: (reason: unknown) => void,
        ) {
          try {
            if (table === "plan_features") {
              resolve({
                data: FEATURES[String(eqs.plan_id)] ?? [],
                error: null,
              });
              return;
            }
            resolve({ data: [], error: null });
          } catch (error) {
            reject?.(error);
          }
        },
      };
      return builder;
    },
  };
}

async function load(row: ReturnType<typeof subscriptionRow> | null) {
  return loadChurchEntitlements(ORG, client(row) as never);
}

function smsLimit(values: Awaited<ReturnType<typeof load>>["values"]) {
  return readIntegerEntitlement(values, FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT)
    .limit;
}

async function main() {
  const activeSteward = await load(
    subscriptionRow({ status: "active", planKey: "steward_pro" }),
  );
  assert(activeSteward.plan?.plan_key === "steward_pro", "1 steward plan");
  assert(smsLimit(activeSteward.values) === 250, "1 steward allowance");
  assert(
    readBooleanEntitlement(activeSteward.values, FEATURE_KEYS.INCIDENT_ANALYTICS),
    "1 steward feature",
  );

  const activeServant = await load(
    subscriptionRow({ status: "active", planKey: "servant_standard" }),
  );
  assert(activeServant.plan?.plan_key === "servant_standard", "2 servant plan");
  assert(smsLimit(activeServant.values) === 0, "2 servant included sms");

  const trialing = await load(
    subscriptionRow({ status: "trialing", planKey: "steward_pro" }),
  );
  assert(trialing.plan?.plan_key === "steward_pro", "3 trial plan");
  assert(smsLimit(trialing.values) === 250, "3 trial allowance");

  for (const status of ["past_due", "grace_period"] as const) {
    const entitled = await load(
      subscriptionRow({ status, planKey: "steward_pro" }),
    );
    assert(entitled.plan?.plan_key === "steward_pro", `${status} plan`);
    assert(smsLimit(entitled.values) === 250, `${status} allowance`);
  }
  assert(
    ACCESS_GRANTING_STATUSES.includes("past_due") &&
      ACCESS_GRANTING_STATUSES.includes("grace_period"),
    "4-5 centralized policy",
  );

  for (const [status, planKey, label] of [
    ["incomplete", "steward_pro", "6-7 incomplete steward"],
    ["incomplete", "omni_enterprise", "8 incomplete omni"],
    ["cancelled", "steward_pro", "9 cancelled"],
    ["expired", "steward_pro", "10 expired"],
    ["suspended", "steward_pro", "11 suspended"],
  ] as const) {
    const denied = await load(subscriptionRow({ status, planKey }));
    assert(denied.plan === null, `${label} plan`);
    assert(denied.usedDefaultPlanFallback === false, `${label} no servant fallback`);
    assert(Object.keys(denied.values).length === 0, `${label} no values`);
    assert(smsLimit(denied.values) === null || smsLimit(denied.values) === 0, `${label} no sms`);
  }

  const pending = await load(
    subscriptionRow({
      status: "active",
      planKey: "steward_pro",
      cancelAtPeriodEnd: true,
    }),
  );
  assert(pending.plan?.plan_key === "steward_pro", "12 pending cancel keeps plan");
  assert(smsLimit(pending.values) === 250, "12 pending cancel keeps allowance");

  const kept = await load(
    subscriptionRow({
      status: "active",
      planKey: "steward_pro",
      cancelAtPeriodEnd: false,
    }),
  );
  assert(kept.plan?.plan_key === "steward_pro", "13 kept subscription");

  const none = await load(null);
  assert(none.usedDefaultPlanFallback === true, "14 missing row uses default plan");
  assert(none.plan?.plan_key === "servant_standard", "14 default is not a historical paid plan");
  assert(none.plan?.plan_key !== "steward_pro", "14 no steward fallback");

  const cancelledSteward = await load(
    subscriptionRow({ status: "cancelled", planKey: "steward_pro" }),
  );
  assert(cancelledSteward.plan === null, "15 cancelled steward is not servant");
  assert(smsLimit(cancelledSteward.values) !== 250, "15 cancelled steward allowance gone");

  const incompleteRow = subscriptionRow({
    status: "incomplete",
    planKey: "steward_pro",
  });
  const retrieved = await getChurchSubscription(ORG, client(incompleteRow) as never);
  assert(retrieved?.status === "incomplete", "16 incomplete row remains retrievable");
  assert(retrieved?.plan_key === "steward_pro", "16 incomplete plan id remains on the row");
  const incompleteEntitlements = await load(incompleteRow);
  assert(incompleteEntitlements.values && Object.keys(incompleteEntitlements.values).length === 0, "16 row does not grant features");

  assert(
    resolveChurchEntitlementSource({
      hasCurrentSubscription: true,
      currentStatus: "active",
      latestStatus: "active",
    }) === "current",
    "pending-cancel source stays current",
  );
  assert(
    resolveChurchEntitlementSource({
      hasCurrentSubscription: true,
      currentStatus: "incomplete",
      latestStatus: "incomplete",
    }) === "none",
    "incomplete source grants nothing",
  );

  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/106_application_sms_capacity.sql"),
    "utf8",
  );
  assert(
    migration.includes(
      `status IN (${ACCESS_GRANTING_STATUSES.map((status) => `'${status}'`).join(", ")})`,
    ),
    "17 SMS reserve matches centralized access statuses",
  );

  console.log("entitlement access selfcheck passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

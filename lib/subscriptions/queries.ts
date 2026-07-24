import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isFeatureKey } from "@/lib/subscriptions/feature-keys";
import { isPlanKey } from "@/lib/subscriptions/plan-keys";
import type {
  ChurchSubscriptionRecord,
  FeatureRecord,
  FeatureValueType,
  PlanFeatureAssignment,
  SubscriptionPlanRecord,
} from "@/lib/subscriptions/types";

function isMissingRelation(message: string): boolean {
  return /subscription_plans|features|plan_features|church_subscriptions|does not exist|schema cache|Could not find the table/i.test(
    message,
  );
}

export function subscriptionsMigrationHint(): string {
  return "Subscription entitlements require supabase/migrations/042_subscription_entitlements.sql.";
}

export async function areSubscriptionTablesAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("subscription_plans")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  return false;
}

function mapPlan(row: Record<string, unknown>): SubscriptionPlanRecord {
  const planKey = String(row.plan_key ?? "");
  return {
    id: String(row.id),
    plan_key: isPlanKey(planKey) ? planKey : planKey,
    display_name: String(row.display_name ?? planKey),
    description: (row.description as string | null) ?? null,
    status: (row.status as SubscriptionPlanRecord["status"]) ?? "inactive",
    billing_interval:
      (row.billing_interval as SubscriptionPlanRecord["billing_interval"]) ??
      "month",
    monthly_price_cents:
      row.monthly_price_cents === null || row.monthly_price_cents === undefined
        ? null
        : Number(row.monthly_price_cents),
    currency: String(row.currency ?? "USD"),
    sort_order: Number(row.sort_order) || 0,
    is_public: Boolean(row.is_public),
    is_default: Boolean(row.is_default),
    is_custom: Boolean(row.is_custom),
  };
}

function mapFeature(row: Record<string, unknown>): FeatureRecord {
  const featureKey = String(row.feature_key ?? "");
  return {
    id: String(row.id),
    feature_key: isFeatureKey(featureKey) ? featureKey : featureKey,
    display_name: String(row.display_name ?? featureKey),
    description: (row.description as string | null) ?? null,
    category: String(row.category ?? ""),
    value_type: (row.value_type as FeatureValueType) ?? "boolean",
    unit: (row.unit as string | null) ?? null,
    status: String(row.status ?? "active"),
    is_customer_visible: Boolean(row.is_customer_visible),
  };
}

export async function listSubscriptionPlans(): Promise<SubscriptionPlanRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "id, plan_key, display_name, description, status, billing_interval, monthly_price_cents, currency, sort_order, is_public, is_default, is_custom",
    )
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error(
      isMissingRelation(error.message)
        ? subscriptionsMigrationHint()
        : "Unable to load subscription plans.",
    );
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapPlan);
}

export async function getSubscriptionPlanByKey(
  planKey: string,
): Promise<SubscriptionPlanRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "id, plan_key, display_name, description, status, billing_interval, monthly_price_cents, currency, sort_order, is_public, is_default, is_custom",
    )
    .eq("plan_key", planKey)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error("Unable to load subscription plan.");
  }
  if (!data) return null;
  return mapPlan(data as Record<string, unknown>);
}

export async function getDefaultSubscriptionPlan(): Promise<SubscriptionPlanRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "id, plan_key, display_name, description, status, billing_interval, monthly_price_cents, currency, sort_order, is_public, is_default, is_custom",
    )
    .eq("is_default", true)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error("Unable to load default subscription plan.");
  }
  if (data) return mapPlan(data as Record<string, unknown>);

  return getSubscriptionPlanByKey("servant_standard");
}

export async function listFeatures(): Promise<FeatureRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("features")
    .select(
      "id, feature_key, display_name, description, category, value_type, unit, status, is_customer_visible",
    )
    .order("feature_key", { ascending: true });

  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error("Unable to load features.");
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapFeature);
}

export async function listPlanFeatureAssignments(
  planId: string,
): Promise<PlanFeatureAssignment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_features")
    .select(
      `
      plan_id,
      feature_id,
      boolean_value,
      integer_value,
      decimal_value,
      text_value,
      json_value,
      is_inherited,
      features!inner (
        feature_key,
        value_type
      )
    `,
    )
    .eq("plan_id", planId);

  if (error) {
    if (isMissingRelation(error.message)) return [];
    throw new Error("Unable to load plan feature assignments.");
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const feature = row.features as Record<string, unknown> | null;
    const featureKey = String(feature?.feature_key ?? "");
    return {
      plan_id: String(row.plan_id),
      feature_id: String(row.feature_id),
      feature_key: isFeatureKey(featureKey) ? featureKey : featureKey,
      value_type: (feature?.value_type as FeatureValueType) ?? "boolean",
      boolean_value:
        row.boolean_value === null || row.boolean_value === undefined
          ? null
          : Boolean(row.boolean_value),
      integer_value:
        row.integer_value === null || row.integer_value === undefined
          ? null
          : Number(row.integer_value),
      decimal_value:
        row.decimal_value === null || row.decimal_value === undefined
          ? null
          : Number(row.decimal_value),
      text_value: (row.text_value as string | null) ?? null,
      json_value: row.json_value ?? null,
      is_inherited: Boolean(row.is_inherited),
    };
  });
}

const CURRENT_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "grace_period",
  "incomplete",
] as const;

export async function getChurchSubscription(
  churchId: string,
  client?: SupabaseClient,
): Promise<ChurchSubscriptionRecord | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("church_subscriptions")
    .select(
      `
      id,
      church_id,
      plan_id,
      status,
      billing_interval,
      billing_provider,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      cancelled_at,
      trial_start,
      trial_end,
      grace_period_end,
      started_at,
      subscription_plans!inner (
        plan_key,
        display_name
      )
    `,
    )
    .eq("church_id", churchId)
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error.message)) return null;
    throw new Error("Unable to load church subscription.");
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const plan = row.subscription_plans as Record<string, unknown> | null;
  const planKey = String(plan?.plan_key ?? "");

  return {
    id: String(row.id),
    church_id: String(row.church_id),
    plan_id: String(row.plan_id),
    status: row.status as ChurchSubscriptionRecord["status"],
    billing_interval:
      row.billing_interval as ChurchSubscriptionRecord["billing_interval"],
    billing_provider: (row.billing_provider as string | null) ?? null,
    current_period_start: (row.current_period_start as string | null) ?? null,
    current_period_end: (row.current_period_end as string | null) ?? null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    trial_start: (row.trial_start as string | null) ?? null,
    trial_end: (row.trial_end as string | null) ?? null,
    grace_period_end: (row.grace_period_end as string | null) ?? null,
    started_at: String(row.started_at),
    plan_key: isPlanKey(planKey) ? planKey : planKey,
    plan_display_name: String(plan?.display_name ?? planKey),
  };
}

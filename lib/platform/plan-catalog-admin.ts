import { requirePlatformPermission } from "@/lib/platform/auth";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import { BOOLEAN_FEATURE_KEYS, INTEGER_FEATURE_KEYS } from "@/lib/subscriptions/entitlement-values";
import { FEATURE_DISPLAY_NAMES, isFeatureKey } from "@/lib/subscriptions/feature-keys";
import { getMinimumPlanForFeature } from "@/lib/subscriptions/catalog";
import type { FeatureValueType } from "@/lib/subscriptions/types";

export type PlatformPlanFeatureRow = {
  featureId: string;
  featureKey: string;
  displayName: string;
  description: string | null;
  category: string | null;
  valueType: FeatureValueType;
  enabled: boolean;
  integerValue: number | null;
  unlimited: boolean;
};

export type PlatformPlanCatalog = {
  id: string;
  planKey: string;
  displayName: string;
  description: string | null;
  status: string;
  sortOrder: number;
  isDefault: boolean;
  monthlyPriceCents: number | null;
  features: PlatformPlanFeatureRow[];
};

export async function getPlanCatalogForPlatform(
  planKey: string,
): Promise<PlatformPlanCatalog | null> {
  await requirePlatformPermission("plans.read");
  const admin = requirePlatformAdminClient();

  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select(
      "id, plan_key, display_name, description, status, sort_order, is_default, monthly_price_cents",
    )
    .eq("plan_key", planKey)
    .maybeSingle();

  if (planError) {
    throw new Error(`Unable to load plan: ${planError.message}`);
  }
  if (!plan) return null;

  const [{ data: features, error: featuresError }, { data: assignments, error: assignmentError }] =
    await Promise.all([
      admin
        .from("features")
        .select(
          "id, feature_key, display_name, description, category, value_type, status",
        )
        .eq("status", "active")
        .order("feature_key", { ascending: true }),
      admin
        .from("plan_features")
        .select(
          "feature_id, boolean_value, integer_value, decimal_value, text_value",
        )
        .eq("plan_id", plan.id),
    ]);

  if (featuresError) {
    throw new Error(`Unable to load features: ${featuresError.message}`);
  }
  if (assignmentError) {
    throw new Error(`Unable to load plan features: ${assignmentError.message}`);
  }

  const assignmentByFeatureId = new Map(
    (assignments ?? []).map((row) => [String(row.feature_id), row]),
  );

  return {
    id: String(plan.id),
    planKey: String(plan.plan_key),
    displayName: String(plan.display_name),
    description: (plan.description as string | null) ?? null,
    status: String(plan.status),
    sortOrder: Number(plan.sort_order) || 0,
    isDefault: Boolean(plan.is_default),
    monthlyPriceCents:
      plan.monthly_price_cents === null || plan.monthly_price_cents === undefined
        ? null
        : Number(plan.monthly_price_cents),
    features: (features ?? []).map((feature) => {
        const assignment = assignmentByFeatureId.get(String(feature.id));
        const valueType = (feature.value_type as FeatureValueType) ?? "boolean";
        const hasAssignment = Boolean(assignment);
        const integerValue =
          assignment?.integer_value === null ||
          assignment?.integer_value === undefined
            ? null
            : Number(assignment.integer_value);
        const unlimited = valueType === "integer" && hasAssignment && integerValue === null;
        return {
          featureId: String(feature.id),
          featureKey: String(feature.feature_key),
          displayName: String(
            feature.display_name ??
              FEATURE_DISPLAY_NAMES[feature.feature_key as keyof typeof FEATURE_DISPLAY_NAMES] ??
              feature.feature_key,
          ),
          description: (feature.description as string | null) ?? null,
          category: (feature.category as string | null) ?? null,
          valueType,
          enabled:
            valueType === "boolean"
              ? Boolean(assignment?.boolean_value)
              : hasAssignment && (unlimited || (integerValue ?? 0) > 0),
          integerValue,
          unlimited,
        };
    }),
  };
}

export async function updatePlanFeatureAssignment(params: {
  planKey: string;
  featureId: string;
  enabled?: boolean;
  integerValue?: number | null;
  unlimited?: boolean;
  actorUserId: string | null;
  platformAccountId: string | null;
}): Promise<void> {
  await requirePlatformPermission("plans.manage");
  const admin = requirePlatformAdminClient();

  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select("id, plan_key, display_name")
    .eq("plan_key", params.planKey)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error("Unable to load plan for update.");
  }

  const { data: feature, error: featureError } = await admin
    .from("features")
    .select("id, feature_key, value_type, display_name")
    .eq("id", params.featureId)
    .maybeSingle();
  if (featureError || !feature) {
    throw new Error("Unable to load feature for update.");
  }

  const { data: existing } = await admin
    .from("plan_features")
    .select("id, boolean_value, integer_value")
    .eq("plan_id", plan.id)
    .eq("feature_id", feature.id)
    .maybeSingle();

  const valueType = String(feature.value_type);
  const payload: {
    plan_id: string;
    feature_id: string;
    boolean_value: boolean | null;
    integer_value: number | null;
    is_inherited: boolean;
  } =
    valueType === "integer"
      ? {
          plan_id: String(plan.id),
          feature_id: String(feature.id),
          boolean_value: null,
          integer_value: params.unlimited ? null : (params.integerValue ?? 0),
          is_inherited: false,
        }
      : {
          plan_id: String(plan.id),
          feature_id: String(feature.id),
          boolean_value: Boolean(params.enabled),
          integer_value: null,
          is_inherited: false,
        };

  if (existing?.id) {
    const { error } = await admin
      .from("plan_features")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(`Unable to update plan feature: ${error.message}`);
  } else {
    const { error } = await admin.from("plan_features").insert(payload);
    if (error) throw new Error(`Unable to add plan feature: ${error.message}`);
  }

  await writePlatformAdminAction({
    platformAccountId: params.platformAccountId,
    actorUserId: params.actorUserId,
    action: existing?.id ? "plan.feature.updated" : "plan.feature.added",
    targetType: "subscription_plan",
    targetId: String(plan.id),
    metadata: {
      plan_key: plan.plan_key,
      feature_key: feature.feature_key,
      old_boolean: existing?.boolean_value ?? null,
      new_boolean: payload.boolean_value,
      old_integer: existing?.integer_value ?? null,
      new_integer: payload.integer_value,
    },
  });
}

export async function listFeatureCatalogForPlatform(): Promise<
  Array<{
    id: string;
    featureKey: string;
    displayName: string;
    description: string | null;
    category: string | null;
    status: string;
    valueType: string;
    minimumPlanName: string | null;
  }>
> {
  await requirePlatformPermission("features.read");
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("features")
    .select(
      "id, feature_key, display_name, description, category, status, value_type",
    )
    .order("feature_key", { ascending: true });

  if (error) {
    throw new Error(`Unable to list features: ${error.message}`);
  }

  const rows = [];
  for (const feature of data ?? []) {
    const featureKey = String(feature.feature_key);
    const minimum = isFeatureKey(featureKey)
      ? await getMinimumPlanForFeature(featureKey)
      : null;
    rows.push({
      id: String(feature.id),
      featureKey,
      displayName: String(feature.display_name ?? featureKey),
      description: (feature.description as string | null) ?? null,
      category: (feature.category as string | null) ?? null,
      status: String(feature.status ?? ""),
      valueType: String(feature.value_type ?? ""),
      minimumPlanName: minimum?.displayName ?? null,
    });
  }
  return rows;
}

export { BOOLEAN_FEATURE_KEYS, INTEGER_FEATURE_KEYS };

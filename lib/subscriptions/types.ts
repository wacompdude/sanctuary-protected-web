import type { FeatureKey } from "@/lib/subscriptions/feature-keys";
import type { PlanKey } from "@/lib/subscriptions/plan-keys";

export type FeatureValueType =
  | "boolean"
  | "integer"
  | "decimal"
  | "text"
  | "json";

export type SubscriptionPlanStatus =
  | "draft"
  | "active"
  | "inactive"
  | "archived";

export type ChurchSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "grace_period"
  | "cancelled"
  | "expired"
  | "suspended"
  | "incomplete";

export type SubscriptionBillingInterval = "month" | "year";

export type SubscriptionPlanRecord = {
  id: string;
  plan_key: PlanKey | string;
  display_name: string;
  description: string | null;
  status: SubscriptionPlanStatus;
  billing_interval: SubscriptionBillingInterval;
  monthly_price_cents: number | null;
  currency: string;
  sort_order: number;
  is_public: boolean;
  is_default: boolean;
  is_custom: boolean;
};

export type FeatureRecord = {
  id: string;
  feature_key: FeatureKey | string;
  display_name: string;
  description: string | null;
  category: string;
  value_type: FeatureValueType;
  unit: string | null;
  status: string;
  is_customer_visible: boolean;
};

export type PlanFeatureAssignment = {
  plan_id: string;
  feature_id: string;
  feature_key: FeatureKey | string;
  value_type: FeatureValueType;
  boolean_value: boolean | null;
  integer_value: number | null;
  decimal_value: number | null;
  text_value: string | null;
  json_value: unknown;
  is_inherited: boolean;
};

export type ChurchSubscriptionRecord = {
  id: string;
  church_id: string;
  plan_id: string;
  status: ChurchSubscriptionStatus;
  billing_interval: SubscriptionBillingInterval;
  billing_provider: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  grace_period_end: string | null;
  started_at: string;
  plan_key: PlanKey | string;
  plan_display_name: string;
};

/** Resolved scalar for one feature key. */
export type EntitlementValue =
  | { kind: "boolean"; value: boolean }
  | { kind: "integer"; value: number | null }
  | { kind: "decimal"; value: number | null }
  | { kind: "text"; value: string | null }
  | { kind: "json"; value: unknown }
  | { kind: "missing"; value: null };

export type ChurchEntitlements = {
  churchId: string;
  subscription: ChurchSubscriptionRecord | null;
  plan: SubscriptionPlanRecord | null;
  /** True when no church_subscriptions row exists and default plan was used. */
  usedDefaultPlanFallback: boolean;
  /** Map of feature_key → resolved value */
  values: Record<string, EntitlementValue>;
};

export type FeatureAccessResult = {
  allowed: boolean;
  featureKey: FeatureKey;
  planKey: string | null;
  planDisplayName: string | null;
  reason?: string;
};

export type FeatureLimitResult = {
  featureKey: FeatureKey;
  limit: number | null;
  unlimited: boolean;
  planKey: string | null;
  planDisplayName: string | null;
};

export type FeatureCapacityResult = {
  allowed: boolean;
  featureKey: FeatureKey;
  limit: number | null;
  unlimited: boolean;
  currentUsage: number;
  requestedIncrease: number;
  remaining: number | null;
  planKey: string | null;
  planDisplayName: string | null;
  reason?: string;
};

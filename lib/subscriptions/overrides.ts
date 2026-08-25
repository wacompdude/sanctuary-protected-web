import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { entitlementFromAssignment } from "@/lib/subscriptions/entitlement-values";
import type { EntitlementValue, FeatureValueType } from "@/lib/subscriptions/types";

/**
 * Apply platform-managed organization_entitlement_overrides on top of
 * plan_features. Church admins cannot create these rows.
 */
export const listActiveEntitlementOverrides = cache(
  async (
    organizationId: string,
  ): Promise<Record<string, EntitlementValue>> => {
    const trimmed = organizationId.trim();
    if (!trimmed) return {};

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("organization_entitlement_overrides")
      .select(
        `
        boolean_value,
        integer_value,
        decimal_value,
        text_value,
        starts_at,
        expires_at,
        status,
        revoked_at,
        features!inner (
          feature_key,
          value_type
        )
      `,
      )
      .eq("church_id", trimmed)
      .eq("status", "active")
      .is("revoked_at", null);

    if (error || !data) {
      return {};
    }

    const values: Record<string, EntitlementValue> = {};
    for (const row of data as Record<string, unknown>[]) {
      const startsAt = String(row.starts_at ?? "");
      const expiresAt = row.expires_at ? String(row.expires_at) : null;
      if (startsAt && startsAt > now) continue;
      if (expiresAt && expiresAt <= now) continue;

      const feature = row.features as Record<string, unknown> | null;
      const featureKey = String(feature?.feature_key ?? "");
      if (!featureKey) continue;

      values[featureKey] = entitlementFromAssignment({
        plan_id: "override",
        feature_id: featureKey,
        feature_key: featureKey,
        value_type: (feature?.value_type as FeatureValueType) || "boolean",
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
        json_value: null,
        is_inherited: false,
      });
    }

    return values;
  },
);

export function mergeEntitlementValues(
  base: Record<string, EntitlementValue>,
  overrides: Record<string, EntitlementValue>,
): Record<string, EntitlementValue> {
  if (Object.keys(overrides).length === 0) return base;
  return { ...base, ...overrides };
}

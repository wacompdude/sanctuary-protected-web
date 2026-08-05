import { buildHelpFeatureNotices } from "@/lib/help/plan-notices";
import type { HelpFeatureNotice } from "@/lib/help/types";
import { hasFeature } from "@/lib/subscriptions/resolver";

/** Resolve live entitlement notices for Help article feature keys. */
export async function resolveHelpFeatureNoticesForChurch(params: {
  organizationId: string;
  featureKeys: readonly string[];
  planKeysOverride?: readonly string[] | null;
}): Promise<HelpFeatureNotice[]> {
  if (params.featureKeys.length === 0) return [];

  const includedByFeatureKey = new Map<string, boolean>();
  await Promise.all(
    params.featureKeys.map(async (featureKey) => {
      const access = await hasFeature({
        organizationId: params.organizationId,
        featureKey,
      });
      includedByFeatureKey.set(featureKey, access.allowed);
    }),
  );

  const planKeysByFeatureKey =
    params.planKeysOverride && params.planKeysOverride.length > 0
      ? new Map(
          params.featureKeys.map((key) => [key, params.planKeysOverride!] as const),
        )
      : undefined;

  return buildHelpFeatureNotices({
    featureKeys: params.featureKeys,
    includedByFeatureKey,
    planKeysByFeatureKey,
  });
}

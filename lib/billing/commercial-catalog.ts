/**
 * Approved commercial catalog constants for Phase 4A+.
 * Server-side Stripe resolution will map provider_lookup_key → Price objects.
 * Do not put Stripe price/product IDs here.
 */

import { PLAN_KEYS, type PlanKey } from "@/lib/subscriptions/plan-keys";

export type CommercialPlanCatalogEntry = {
  planKey: PlanKey;
  monthlyPriceCents: number;
  usersActiveLimit: number | null;
  usersUnlimited: boolean;
  monthlySmsSegmentLimit: number;
  subscriptionLookupKey: string;
  smsExtraItemKey: string;
  smsPackageLookupKey: string;
  smsPackageCredits: number;
  smsPackagePriceCents: number;
  suggestedLowBalanceThreshold: number;
};

export const COMMERCIAL_PLAN_CATALOG: readonly CommercialPlanCatalogEntry[] = [
  {
    planKey: PLAN_KEYS.SERVANT_STANDARD,
    monthlyPriceCents: 2995,
    usersActiveLimit: 10,
    usersUnlimited: false,
    monthlySmsSegmentLimit: 0,
    subscriptionLookupKey: "servant_standard_monthly",
    smsExtraItemKey: "sms_block_50",
    smsPackageLookupKey: "servant_standard_sms_50",
    smsPackageCredits: 50,
    smsPackagePriceCents: 500,
    suggestedLowBalanceThreshold: 10,
  },
  {
    planKey: PLAN_KEYS.STEWARD_PRO,
    monthlyPriceCents: 3995,
    usersActiveLimit: 20,
    usersUnlimited: false,
    monthlySmsSegmentLimit: 250,
    subscriptionLookupKey: "steward_pro_monthly",
    smsExtraItemKey: "sms_block_100",
    smsPackageLookupKey: "steward_pro_sms_100",
    smsPackageCredits: 100,
    smsPackagePriceCents: 1000,
    suggestedLowBalanceThreshold: 20,
  },
  {
    planKey: PLAN_KEYS.SHEPHERD_PLUS,
    monthlyPriceCents: 5995,
    usersActiveLimit: 35,
    usersUnlimited: false,
    monthlySmsSegmentLimit: 500,
    subscriptionLookupKey: "shepherd_plus_monthly",
    smsExtraItemKey: "sms_block_200",
    smsPackageLookupKey: "shepherd_plus_sms_200",
    smsPackageCredits: 200,
    smsPackagePriceCents: 2000,
    suggestedLowBalanceThreshold: 40,
  },
  {
    planKey: PLAN_KEYS.OMNI_ENTERPRISE,
    monthlyPriceCents: 15000,
    usersActiveLimit: null,
    usersUnlimited: true,
    monthlySmsSegmentLimit: 1000,
    subscriptionLookupKey: "omni_enterprise_monthly",
    smsExtraItemKey: "sms_block_500",
    smsPackageLookupKey: "omni_enterprise_sms_500",
    smsPackageCredits: 500,
    smsPackagePriceCents: 4000,
    suggestedLowBalanceThreshold: 100,
  },
] as const;

export function commercialPlanByKey(
  planKey: string,
): CommercialPlanCatalogEntry | undefined {
  return COMMERCIAL_PLAN_CATALOG.find((entry) => entry.planKey === planKey);
}

/** Resolve the only SMS package an organization plan may purchase. */
export function smsPackageForPlan(
  planKey: string,
): CommercialPlanCatalogEntry | undefined {
  return commercialPlanByKey(planKey);
}

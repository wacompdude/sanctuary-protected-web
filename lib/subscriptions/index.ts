export type {
  FeatureValueType,
  SubscriptionPlanStatus,
  ChurchSubscriptionStatus,
  SubscriptionBillingInterval,
  SubscriptionPlanRecord,
  FeatureRecord,
  PlanFeatureAssignment,
  ChurchSubscriptionRecord,
  EntitlementValue,
  ChurchEntitlements,
  FeatureAccessResult,
  FeatureLimitResult,
  FeatureCapacityResult,
} from "@/lib/subscriptions/types";

export {
  FEATURE_KEYS,
  FEATURE_KEY_LIST,
  FEATURE_DISPLAY_NAMES,
  isFeatureKey,
} from "@/lib/subscriptions/feature-keys";
export type { FeatureKey } from "@/lib/subscriptions/feature-keys";

export {
  PLAN_KEYS,
  PLAN_KEY_LIST,
  PLAN_DISPLAY_NAMES,
  isPlanKey,
} from "@/lib/subscriptions/plan-keys";
export type { PlanKey } from "@/lib/subscriptions/plan-keys";

export {
  EntitlementError,
  upgradeMessageForFeature,
  limitMessageForFeature,
} from "@/lib/subscriptions/errors";

export {
  entitlementFromAssignment,
  buildEntitlementMap,
  readBooleanEntitlement,
  readIntegerEntitlement,
  evaluateFeatureCapacity,
  BOOLEAN_FEATURE_KEYS,
  INTEGER_FEATURE_KEYS,
} from "@/lib/subscriptions/entitlement-values";

export { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";

export {
  areSubscriptionTablesAvailable,
  subscriptionsMigrationHint,
  listSubscriptionPlans,
  getSubscriptionPlanByKey,
  getDefaultSubscriptionPlan,
  listFeatures,
  listPlanFeatureAssignments,
  getChurchSubscription,
} from "@/lib/subscriptions/queries";

export {
  getPlanEntitlements,
  getChurchEntitlements,
  hasFeature,
  getFeatureLimit,
  requireFeature,
  requireFeatureCapacity,
} from "@/lib/subscriptions/resolver";

export {
  CURRENT_SUBSCRIPTION_STATUSES,
  ACCESS_GRANTING_STATUSES,
  isCurrentSubscriptionStatus,
  subscriptionGrantsAccess,
  planRank,
  isPlanDowngrade,
  isPlanUpgrade,
  buildPeriodWindow,
  isWithinPeriod,
  isTrialActive,
} from "@/lib/subscriptions/status";
export type { PeriodWindow } from "@/lib/subscriptions/status";

export {
  recommendPlanFromSignals,
  collectChurchUsageSignals,
  recommendPlanForChurch,
} from "@/lib/subscriptions/recommend-plan";
export type { ChurchUsageSignals } from "@/lib/subscriptions/recommend-plan";

export {
  ensureChurchSubscription,
  changeChurchSubscriptionPlan,
  updateChurchSubscriptionStatus,
  scheduleChurchSubscriptionCancellation,
} from "@/lib/subscriptions/mutations";
export type { SubscriptionMutationResult } from "@/lib/subscriptions/mutations";

export { migrateAllChurchSubscriptions } from "@/lib/subscriptions/migrate";
export type {
  ChurchSubscriptionMigrationRow,
  MigrateChurchSubscriptionsResult,
} from "@/lib/subscriptions/migrate";

export {
  isEntitlementError,
  entitlementErrorMessage,
  countActiveChurchMembers,
  countActiveCampuses,
  requireActiveSeatCapacity,
  requireCampusCreateCapacity,
  getIncidentPhotoEntitlements,
  requireIncidentPhotoUpload,
  getEnabledFeatureKeys,
  NAV_FEATURE_REQUIREMENTS,
} from "@/lib/subscriptions/enforcement";

export { NAV_ENTITLEMENT_FEATURE_KEYS } from "@/lib/subscriptions/nav-features";

export type {
  SubscriptionUsageEventType,
  UsageWarningLevel,
  BillingPeriodBounds,
  UsageMeter,
  RecordUsageEventInput,
  RecordUsageEventResult,
} from "@/lib/subscriptions/usage-types";

export {
  estimateSmsSegments,
  estimateSmsSegmentsForRecipients,
  estimateSmsCodeUnits,
  isGsm7Compatible,
} from "@/lib/subscriptions/sms-segments";

export {
  usageWarningLevel,
  resolveBillingPeriod,
  getUsageMeter,
  recordUsageEvent,
  reserveUsage,
  consumeUsage,
  releaseUsage,
  reconcileUsageFromEvents,
  getSeatUsageMeter,
  getSmsSegmentUsageMeter,
  requireSmsSegmentCapacity,
  recordSmsSegmentsConsumed,
  reserveSmsSegments,
  releaseSmsSegmentReservation,
} from "@/lib/subscriptions/usage";

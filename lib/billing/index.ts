export type {
  BillingProviderId,
  BillingCheckoutMode,
  BillingCheckoutRequest,
  BillingCheckoutSession,
  BillingPortalRequest,
  BillingPortalSession,
  BillingWebhookReceiveResult,
  BillingProviderCapability,
  BillingProvider,
  DowngradeImpactItem,
  DowngradeImpactReport,
  BillingHistoryItem,
} from "@/lib/billing/types";

export {
  BillingProviderNotConfiguredError,
  UnconfiguredBillingProvider,
} from "@/lib/billing/unconfigured-provider";

export {
  BillingConfigurationError,
  BillingProviderUnknownError,
  BillingNotImplementedError,
} from "@/lib/billing/errors";

export {
  classifyStripeSecretMode,
  getStripeBillingConfigStatus,
  isStripeSecretConfigured,
  resolveBillingProviderIdFromEnv,
} from "@/lib/billing/stripe/config";

export {
  getConfiguredBillingProviderId,
  getBillingProvider,
  isBillingProviderReady,
  billingProviderStatusMessage,
} from "@/lib/billing/provider";

export { processBillingWebhook } from "@/lib/billing/webhooks";
export { buildDowngradeImpactReport } from "@/lib/billing/downgrade-impact";
export { listBillingHistory } from "@/lib/billing/history";
export {
  DEFAULT_BILLING_TRIAL_DAYS,
  DEFAULT_BILLING_PERIOD_DAYS,
  resolveTrialPeriodDays,
} from "@/lib/billing/settings";

export {
  COMMERCIAL_PLAN_CATALOG,
  commercialPlanByKey,
  smsPackageForPlan,
} from "@/lib/billing/commercial-catalog";

export {
  canViewOrganizationBilling,
  canManageOrganizationBilling,
  requireBillingViewAccess,
  requireBillingManageAccess,
} from "@/lib/billing/access";

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
  BillingCheckoutPlanError,
  BillingCheckoutUrlError,
  BillingAuthorizationError,
  StripeCatalogNotFoundError,
  StripeCatalogAmbiguousError,
  StripeCatalogMismatchError,
  StripeLiveModeForbiddenError,
  StripeUnknownModeForbiddenError,
} from "@/lib/billing/errors";

export {
  classifyStripeSecretMode,
  getStripeBillingConfigStatus,
  isStripeSecretConfigured,
  resolveBillingProviderIdFromEnv,
} from "@/lib/billing/stripe/config";

export {
  assertSandboxCatalogValidationMode,
  matchStripePriceToExpectation,
  resolveStripePriceByInternalKey,
  resolveStripePriceByLookupKey,
  validateStripeCommercialCatalog,
} from "@/lib/billing/stripe/catalog";
export type {
  CatalogEntryValidationResult,
  ListPricesByLookupKey,
  ResolvedStripePrice,
  StripeCommercialCatalogValidationReport,
  StripePriceSnapshot,
} from "@/lib/billing/stripe/catalog";

export {
  assertNoClientPriceOverrides,
  assertSubscriptionCheckoutPlanKey,
  createSubscriptionCheckoutSession,
} from "@/lib/billing/stripe/checkout";
export {
  buildBillingCheckoutUrls,
  resolveAppOrigin,
  assertSafeBillingCheckoutUrls,
} from "@/lib/billing/stripe/checkout-urls";
export {
  ensureStripeCustomerForOrganization,
  stripeCustomerIdempotencyKey,
} from "@/lib/billing/stripe/customers";

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
  listCommercialPriceExpectations,
  commercialExpectationByInternalKey,
  subscriptionLookupKeyForPlan,
  smsLookupKeyForExtraItem,
} from "@/lib/billing/commercial-catalog";
export type {
  CommercialPriceExpectation,
  CommercialPriceKind,
} from "@/lib/billing/commercial-catalog";

export {
  canViewOrganizationBilling,
  canManageOrganizationBilling,
  requireBillingViewAccess,
  requireBillingManageAccess,
} from "@/lib/billing/access";

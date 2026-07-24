import type { PlanKey } from "@/lib/subscriptions/plan-keys";

export type BillingProviderId = "none" | "stripe" | "manual";

export type BillingCheckoutMode = "subscription" | "setup";

export type BillingCheckoutRequest = {
  churchId: string;
  planKey: PlanKey | string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  billingInterval?: "month" | "year";
};

export type BillingCheckoutSession = {
  provider: BillingProviderId;
  sessionId: string;
  url: string;
};

export type BillingPortalRequest = {
  churchId: string;
  returnUrl: string;
  providerCustomerId?: string | null;
};

export type BillingPortalSession = {
  provider: BillingProviderId;
  url: string;
};

export type BillingWebhookReceiveResult = {
  ok: boolean;
  status: number;
  duplicate?: boolean;
  eventId?: string | null;
  error?: string;
  /** Provider-normalized event type for app handlers. */
  normalizedType?: string | null;
};

export type BillingProviderCapability = {
  checkout: boolean;
  customerPortal: boolean;
  webhooks: boolean;
  cancelAtProvider: boolean;
};

/**
 * Provider adapter contract. Implementations must never log secrets
 * or persist raw webhook payloads that include credentials.
 */
export type BillingProvider = {
  id: BillingProviderId;
  displayName: string;
  isConfigured(): boolean;
  capabilities(): BillingProviderCapability;
  createCheckoutSession(
    request: BillingCheckoutRequest,
  ): Promise<BillingCheckoutSession>;
  createCustomerPortalSession(
    request: BillingPortalRequest,
  ): Promise<BillingPortalSession>;
  /**
   * Verify signature + parse. Return sanitized event metadata only.
   * Persistence / idempotency is handled by processBillingWebhook.
   */
  verifyAndParseWebhook(input: {
    rawBody: string;
    headers: Headers;
  }): Promise<{
    ok: boolean;
    status: number;
    error?: string;
    providerEventId?: string | null;
    eventType: string;
    churchId?: string | null;
    metadata?: Record<string, unknown>;
  }>;
};

export type DowngradeImpactItem = {
  kind: "feature_loss" | "limit_exceeded" | "info";
  featureKey: string;
  label: string;
  detail: string;
};

export type DowngradeImpactReport = {
  fromPlanKey: string;
  toPlanKey: string;
  fromPlanDisplayName: string;
  toPlanDisplayName: string;
  isDowngrade: boolean;
  isUpgrade: boolean;
  isSamePlan: boolean;
  blocking: boolean;
  items: DowngradeImpactItem[];
  summary: string;
};

export type BillingHistoryItem = {
  id: string;
  kind: "subscription_change" | "billing_event";
  occurredAt: string;
  title: string;
  detail: string | null;
  status?: string | null;
};

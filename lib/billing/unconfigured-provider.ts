import type {
  BillingCheckoutRequest,
  BillingCheckoutSession,
  BillingPortalRequest,
  BillingPortalSession,
  BillingProvider,
} from "@/lib/billing/types";

export class BillingProviderNotConfiguredError extends Error {
  readonly code = "billing_provider_not_configured";

  constructor(message?: string) {
    super(
      message ??
        "No billing provider is configured. Checkout and customer portal are unavailable until a provider adapter is connected.",
    );
    this.name = "BillingProviderNotConfiguredError";
  }
}

/** Default adapter when BILLING_PROVIDER is unset or "none". */
export class UnconfiguredBillingProvider implements BillingProvider {
  id = "none" as const;
  displayName = "Not configured";

  isConfigured(): boolean {
    return false;
  }

  capabilities() {
    return {
      checkout: false,
      customerPortal: false,
      webhooks: false,
      cancelAtProvider: false,
    };
  }

  async createCheckoutSession(
    _request: BillingCheckoutRequest,
  ): Promise<BillingCheckoutSession> {
    void _request;
    throw new BillingProviderNotConfiguredError();
  }

  async createCustomerPortalSession(
    _request: BillingPortalRequest,
  ): Promise<BillingPortalSession> {
    void _request;
    throw new BillingProviderNotConfiguredError();
  }

  async verifyAndParseWebhook() {
    return {
      ok: false as const,
      status: 501,
      error: "No billing provider is configured to accept webhooks.",
      eventType: "unconfigured",
      providerEventId: null,
      churchId: null,
      metadata: {},
    };
  }
}

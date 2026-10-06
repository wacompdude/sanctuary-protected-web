/**
 * Sanitized billing errors. Never include secret values in messages.
 */

export class BillingConfigurationError extends Error {
  readonly code = "billing_configuration_error";

  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export class BillingProviderUnknownError extends Error {
  readonly code = "billing_provider_unknown";

  constructor(providerRaw: string) {
    const safe = providerRaw.trim().slice(0, 32) || "(empty)";
    super(
      `Unknown BILLING_PROVIDER value "${safe}". Use "none"/"unconfigured" or "stripe".`,
    );
    this.name = "BillingProviderUnknownError";
  }
}

export class BillingNotImplementedError extends Error {
  readonly code = "billing_not_implemented";

  constructor(operation: string) {
    super(
      `${operation} is not implemented yet for the Stripe billing provider (Phase 4B-1 foundation only).`,
    );
    this.name = "BillingNotImplementedError";
  }
}

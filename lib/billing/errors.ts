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

export class StripeCatalogNotFoundError extends Error {
  readonly code = "stripe_catalog_not_found";

  constructor(lookupKey: string) {
    super(
      `No Stripe Price found for lookup key "${lookupKey.slice(0, 64)}".`,
    );
    this.name = "StripeCatalogNotFoundError";
  }
}

export class StripeCatalogAmbiguousError extends Error {
  readonly code = "stripe_catalog_ambiguous";

  constructor(lookupKey: string, matchCount: number) {
    super(
      `Expected exactly one Stripe Price for lookup key "${lookupKey.slice(0, 64)}", found ${matchCount}.`,
    );
    this.name = "StripeCatalogAmbiguousError";
  }
}

export class StripeCatalogMismatchError extends Error {
  readonly code = "stripe_catalog_mismatch";

  constructor(lookupKey: string, detail: string) {
    super(
      `Stripe Price for lookup key "${lookupKey.slice(0, 64)}" failed validation: ${detail}`,
    );
    this.name = "StripeCatalogMismatchError";
  }
}

export class StripeLiveModeForbiddenError extends Error {
  readonly code = "stripe_live_mode_forbidden";

  constructor(context = "Phase 4B-2 catalog validation") {
    super(
      `${context} refuses live Stripe secret keys. Use a sandbox (sk_test_) key only.`,
    );
    this.name = "StripeLiveModeForbiddenError";
  }
}

export class StripeUnknownModeForbiddenError extends Error {
  readonly code = "stripe_unknown_mode_forbidden";

  constructor(context = "Phase 4B-2 catalog validation") {
    super(
      `${context} requires a recognizable Stripe test secret key (sk_test_...).`,
    );
    this.name = "StripeUnknownModeForbiddenError";
  }
}

export class BillingDowngradeError extends Error {
  readonly code = "billing_downgrade_rejected";

  constructor(message: string) {
    super(message);
    this.name = "BillingDowngradeError";
  }
}

export class BillingUpgradeError extends Error {
  readonly code = "billing_upgrade_rejected";

  constructor(message: string) {
    super(message);
    this.name = "BillingUpgradeError";
  }
}

export class BillingCheckoutPlanError extends Error {
  readonly code = "billing_checkout_plan_error";

  constructor(message: string) {
    super(message);
    this.name = "BillingCheckoutPlanError";
  }
}

export class BillingCheckoutUrlError extends Error {
  readonly code = "billing_checkout_url_error";

  constructor(message: string) {
    super(message);
    this.name = "BillingCheckoutUrlError";
  }
}

export class BillingAuthorizationError extends Error {
  readonly code = "billing_authorization_error";

  constructor(message: string) {
    super(message);
    this.name = "BillingAuthorizationError";
  }
}

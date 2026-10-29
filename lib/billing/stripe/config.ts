/**
 * Stripe secret configuration helpers (no SDK import).
 * Safe for local self-checks. Never log or return secret values.
 */

import type { BillingProviderId } from "@/lib/billing/types";
import {
  BillingConfigurationError,
  BillingProviderUnknownError,
} from "@/lib/billing/errors";

export type StripeSecretMode = "test" | "live" | "unknown";

export type StripeBillingConfigStatus = {
  provider: BillingProviderId | "unknown";
  requestedProvider: string;
  configured: boolean;
  mode: StripeSecretMode | null;
  secretPresent: boolean;
  webhookSecretPresent: boolean;
};

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Normalize BILLING_PROVIDER.
 * Accepts: none | unconfigured | stripe | manual
 * Unknown values throw BillingProviderUnknownError (do not silently coerce).
 */
export function resolveBillingProviderIdFromEnv(
  rawValue?: string | null,
): BillingProviderId {
  const raw = (rawValue ?? process.env.BILLING_PROVIDER ?? "none")
    .trim()
    .toLowerCase();
  if (!raw || raw === "none" || raw === "unconfigured") {
    return "none";
  }
  if (raw === "stripe") {
    return "stripe";
  }
  if (raw === "manual") {
    return "manual";
  }
  throw new BillingProviderUnknownError(raw);
}

/**
 * Classify a Stripe secret key by prefix only. Never log or return the key.
 */
export function classifyStripeSecretMode(
  secretKey: string | null | undefined,
): StripeSecretMode {
  const key = (secretKey ?? "").trim();
  if (!key) return "unknown";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "unknown";
}

/** Server-only operational authorization for Live Stripe Checkout. */
export const STRIPE_LIVE_CHECKOUT_ENABLED_ENV = "STRIPE_LIVE_CHECKOUT_ENABLED";

/**
 * Fail-closed Live Checkout authorization.
 * Only the exact string "true" enables Live Checkout. Missing, empty, "false",
 * "TRUE", "1", and any other value remain blocked.
 * Sandbox/test Checkout does not require this flag.
 * Never expose via NEXT_PUBLIC_*.
 */
export function isStripeLiveCheckoutEnabled(
  envValue: string | null | undefined = process.env.STRIPE_LIVE_CHECKOUT_ENABLED,
): boolean {
  return envValue === "true";
}

/**
 * Server-only operational authorization for Live paid subscription upgrades
 * (operator-initiated subscriptions.update with immediate proration).
 * Independent of STRIPE_LIVE_CHECKOUT_ENABLED.
 * Does NOT gate renewals, invoice.paid, or other webhook processing.
 */
export const STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED_ENV =
  "STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED";

/**
 * Fail-closed Live paid-upgrade authorization.
 * Only the exact string "true" enables Live upgrades. Missing, empty, "false",
 * "TRUE", "1", and any other value remain blocked.
 * Sandbox/test upgrades do not require this flag.
 * Never expose via NEXT_PUBLIC_*.
 */
export function isStripeLiveSubscriptionUpgradeEnabled(
  envValue: string | null | undefined = process.env
    .STRIPE_LIVE_SUBSCRIPTION_UPGRADES_ENABLED,
): boolean {
  return envValue === "true";
}

/**
 * HMAC secret for opaque upgrade preview authorization tokens.
 * Server-only. Never reuse Stripe secrets or NEXT_PUBLIC_* values.
 */
export const BILLING_UPGRADE_PREVIEW_SIGNING_SECRET_ENV =
  "BILLING_UPGRADE_PREVIEW_SIGNING_SECRET";

export function readBillingUpgradePreviewSigningSecret(
  envValue: string | null | undefined = process.env
    .BILLING_UPGRADE_PREVIEW_SIGNING_SECRET,
): string {
  return (envValue ?? "").trim();
}

export function readStripeSecretKey(): string {
  return readEnv("STRIPE_SECRET_KEY");
}

/**
 * Browser-safe publishable key. The local and production name is
 * STRIPE_PUBLISHABLE_KEY. The documented public alias is accepted when the
 * server name is empty. Never returns a secret key.
 */
export function readStripePublishableKey(): string {
  return readEnv("STRIPE_PUBLISHABLE_KEY") || readEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}

export function requireStripePublishableKey(
  publishableKey: string | null | undefined = readStripePublishableKey(),
): string {
  const key = (publishableKey ?? "").trim();
  if (!key.startsWith("pk_test_") && !key.startsWith("pk_live_")) {
    throw new BillingConfigurationError("Stripe publishable key is not configured.");
  }
  return key;
}

export function readStripeWebhookSecret(): string {
  return readEnv("STRIPE_WEBHOOK_SECRET");
}

export function isStripeSecretConfigured(
  secretKey: string | null | undefined = readStripeSecretKey(),
): boolean {
  return Boolean((secretKey ?? "").trim());
}

export function isStripeWebhookSecretConfigured(
  webhookSecret: string | null | undefined = readStripeWebhookSecret(),
): boolean {
  return Boolean((webhookSecret ?? "").trim());
}

/**
 * Sanitized status for server diagnostics (never includes secret material).
 */
export type StripeBillingEnvInput = {
  BILLING_PROVIDER?: string | null;
  STRIPE_SECRET_KEY?: string | null;
  STRIPE_WEBHOOK_SECRET?: string | null;
};

export function getStripeBillingConfigStatus(
  env: StripeBillingEnvInput = {
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  },
): StripeBillingConfigStatus {
  const requested =
    (env.BILLING_PROVIDER ?? "none").trim().toLowerCase() || "none";
  let provider: BillingProviderId | "unknown" = "unknown";
  try {
    provider = resolveBillingProviderIdFromEnv(env.BILLING_PROVIDER);
  } catch {
    provider = "unknown";
  }

  const secret = (env.STRIPE_SECRET_KEY ?? "").trim();
  const webhook = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const secretPresent = Boolean(secret);
  const configured = provider === "stripe" && secretPresent;

  return {
    provider,
    requestedProvider: requested.slice(0, 32),
    configured,
    mode: provider === "stripe" ? classifyStripeSecretMode(secret) : null,
    secretPresent,
    webhookSecretPresent: Boolean(webhook),
  };
}

/**
 * Require Stripe secret when provider is stripe. Throws sanitized error.
 */
export function requireStripeSecretKey(
  secretKey: string | null | undefined = readStripeSecretKey(),
): string {
  const key = (secretKey ?? "").trim();
  if (!key) {
    throw new BillingConfigurationError(
      "BILLING_PROVIDER is stripe, but STRIPE_SECRET_KEY is missing or empty.",
    );
  }
  return key;
}

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

export function readStripeSecretKey(): string {
  return readEnv("STRIPE_SECRET_KEY");
}

export function readStripeWebhookSecret(): string {
  return readEnv("STRIPE_WEBHOOK_SECRET");
}

export function isStripeSecretConfigured(
  secretKey: string | null | undefined = readStripeSecretKey(),
): boolean {
  return Boolean((secretKey ?? "").trim());
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

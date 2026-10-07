/**
 * Resolve the active billing provider adapter.
 * Phase 4B-1: unconfigured (none) or Stripe foundation (no Checkout/Portal yet).
 */

import type { BillingProvider, BillingProviderId } from "@/lib/billing/types";
import { UnconfiguredBillingProvider } from "@/lib/billing/unconfigured-provider";
import {
  BillingConfigurationError,
  BillingProviderUnknownError,
} from "@/lib/billing/errors";
import { resolveBillingProviderIdFromEnv } from "@/lib/billing/stripe/config";
import { StripeBillingProvider } from "@/lib/billing/stripe/provider";

export function getConfiguredBillingProviderId(): BillingProviderId {
  return resolveBillingProviderIdFromEnv(process.env.BILLING_PROVIDER);
}

export function getBillingProvider(): BillingProvider {
  let id: BillingProviderId;
  try {
    id = getConfiguredBillingProviderId();
  } catch (error) {
    if (error instanceof BillingProviderUnknownError) {
      throw error;
    }
    throw new BillingConfigurationError(
      "Unable to resolve BILLING_PROVIDER configuration.",
    );
  }

  if (id === "stripe") {
    return new StripeBillingProvider();
  }

  // "manual" reserved — treat as unconfigured until a manual adapter exists.
  return new UnconfiguredBillingProvider();
}

/**
 * True when a provider can perform customer-facing billing operations.
 * Phase 4B-1: Stripe may have a secret configured while Checkout/Portal
 * capabilities remain false — keep the billing UI unavailable.
 */
export function isBillingProviderReady(): boolean {
  try {
    const provider = getBillingProvider();
    if (!provider.isConfigured()) return false;
    const caps = provider.capabilities();
    return caps.checkout || caps.customerPortal;
  } catch {
    return false;
  }
}

export function billingProviderStatusMessage(): string {
  try {
    const provider = getBillingProvider();
    if (provider.id === "stripe") {
      if (!provider.isConfigured()) {
        return "BILLING_PROVIDER is set to stripe, but STRIPE_SECRET_KEY is missing or empty.";
      }
      const caps = provider.capabilities();
      if (!caps.checkout && !caps.customerPortal) {
        return "Stripe server foundation is configured. Checkout and customer portal are not enabled yet.";
      }
      if (caps.checkout && !caps.customerPortal) {
        if (caps.webhooks) {
          return "Stripe Checkout and webhook processing are enabled. Customer portal is not enabled yet.";
        }
        return "Stripe Checkout is available. Customer portal and webhook processing are not enabled yet.";
      }
      if (caps.checkout && caps.customerPortal && caps.webhooks) {
        return "Stripe Checkout, customer portal, and webhook processing are enabled.";
      }
      if (caps.checkout && caps.customerPortal) {
        return "Stripe Checkout and customer portal are enabled. Webhook processing is not enabled yet.";
      }
      if (caps.webhooks && !caps.checkout && !caps.customerPortal) {
        return "Stripe webhook processing is enabled. Checkout and customer portal are not enabled yet.";
      }
      return "Stripe is connected.";
    }
    if (provider.isConfigured()) {
      return `${provider.displayName} is connected.`;
    }
    return "No billing provider is connected. Plan entitlements work; checkout and portal are disabled.";
  } catch (error) {
    if (error instanceof BillingProviderUnknownError) {
      return error.message;
    }
    return "Billing provider configuration is invalid.";
  }
}

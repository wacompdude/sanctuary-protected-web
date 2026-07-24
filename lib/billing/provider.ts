import type { BillingProvider, BillingProviderId } from "@/lib/billing/types";
import { UnconfiguredBillingProvider } from "@/lib/billing/unconfigured-provider";

/**
 * Resolve the active billing provider adapter.
 * No payment SDK is installed yet — only the unconfigured adapter is available.
 * When a provider is chosen, register it here behind BILLING_PROVIDER.
 */
export function getConfiguredBillingProviderId(): BillingProviderId {
  const raw = (process.env.BILLING_PROVIDER ?? "none").trim().toLowerCase();
  if (raw === "stripe" || raw === "manual" || raw === "none") {
    return raw;
  }
  return "none";
}

export function getBillingProvider(): BillingProvider {
  const id = getConfiguredBillingProviderId();

  // Future: if (id === "stripe") return new StripeBillingProvider();
  // Do not import provider SDKs until a provider is explicitly selected.
  if (id === "stripe") {
    console.warn(
      "BILLING_PROVIDER=stripe is set, but no Stripe adapter is installed yet. Using unconfigured provider.",
    );
  }

  return new UnconfiguredBillingProvider();
}

export function isBillingProviderReady(): boolean {
  return getBillingProvider().isConfigured();
}

export function billingProviderStatusMessage(): string {
  const provider = getBillingProvider();
  if (provider.isConfigured()) {
    return `${provider.displayName} is connected.`;
  }
  const requested = getConfiguredBillingProviderId();
  if (requested === "stripe") {
    return "BILLING_PROVIDER is set to stripe, but the Stripe adapter and SDK are not installed yet.";
  }
  return "No billing provider is connected. Plan entitlements work; checkout and portal are disabled.";
}

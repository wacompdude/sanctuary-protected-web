"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  BillingCheckoutPlanError,
  BillingCheckoutUrlError,
  BillingConfigurationError,
  BillingNotImplementedError,
  BillingProviderNotConfiguredError,
  BillingUpgradeError,
  buildDowngradeImpactReport,
  getBillingProvider,
  getConfiguredBillingProviderId,
  requireBillingManageAccess,
} from "@/lib/billing";
import { assertNoExistingProviderSubscriptionForInitialCheckout } from "@/lib/billing/checkout-eligibility";
import {
  assertNoClientPriceOverrides,
} from "@/lib/billing/stripe/checkout";
import {
  buildBillingCheckoutUrls,
  resolveAppOrigin,
} from "@/lib/billing/stripe/checkout-urls";
import { isPlanKey } from "@/lib/subscriptions/plan-keys";
import {
  changeChurchSubscriptionPlan,
  scheduleChurchSubscriptionCancellation,
} from "@/lib/subscriptions/mutations";
import { getChurchSubscription } from "@/lib/subscriptions/queries";
import { requireStripeSecretKey } from "@/lib/billing/stripe/config";
import { createStripeUpgradeDeps } from "@/lib/billing/stripe/upgrade-live";
import {
  previewSubscriptionUpgrade,
  confirmSubscriptionUpgrade,
  assertClientUpgradePayload,
  previewFailureMessage,
  safeStripePreviewErrorLog,
  upgradeFailureMessage,
  type LocalUpgradeSubscription,
  type SubscriptionUpgradePreview,
} from "@/lib/billing/stripe/upgrade";
import { ChurchAccessError } from "@/lib/organization/errors";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { DowngradeImpactReport } from "@/lib/billing/types";

export type BillingActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  url?: string;
  impact?: DowngradeImpactReport;
  upgradePreview?: SubscriptionUpgradePreview;
};

export async function previewPlanChangeImpactAction(
  planKey: string,
): Promise<BillingActionState> {
  try {
    const { church } = await requireBillingManageAccess();
    if (!isPlanKey(planKey) && !planKey.trim()) {
      return { error: "Select a valid plan." };
    }
    const impact = await buildDowngradeImpactReport({
      organizationId: church.id,
      targetPlanKey: planKey,
    });
    return { success: true, impact };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to preview plan change.",
    };
  }
}

export async function startCheckoutAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
    const { church, user } = await requireBillingManageAccess();
    const planKey = String(formData.get("plan_key") ?? "").trim();
    if (!planKey) return { error: "Select a plan to continue." };

    const provider = getBillingProvider();
    if (!provider.isConfigured() || !provider.capabilities().checkout) {
      return {
        error:
          "Checkout is not available yet. A billing provider adapter must be connected first.",
      };
    }

    const headerStore = await headers();
    const origin = resolveAppOrigin({
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      forwardedHost: headerStore.get("x-forwarded-host"),
      host: headerStore.get("host"),
      forwardedProto: headerStore.get("x-forwarded-proto"),
    });
    const { successUrl, cancelUrl } = buildBillingCheckoutUrls(origin);

    // Reject accidental client price/amount fields if present on the form.
    assertNoClientPriceOverrides({
      priceId: String(formData.get("price_id") ?? "") || null,
      productId: String(formData.get("product_id") ?? "") || null,
      amount: String(formData.get("amount") ?? "") || null,
      currency: String(formData.get("currency") ?? "") || null,
      lookupKey: String(formData.get("lookup_key") ?? "") || null,
    });

    if (!isPlanKey(planKey)) {
      return { error: "Select a valid subscription plan." };
    }

    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required for Checkout customer mapping.",
      };
    }

    // Re-read authoritative subscription state before any Stripe Checkout create.
    // A Stripe Customer alone must not block; only an existing provider subscription.
    const currentSubscription = await getChurchSubscription(church.id);
    assertNoExistingProviderSubscriptionForInitialCheckout(
      currentSubscription?.billing_subscription_id,
    );

    const session = await provider.createCheckoutSession({
      organizationId: church.id,
      planKey,
      successUrl,
      cancelUrl,
      customerEmail: user.email,
    });

    // Non-authoritative: redirect only. Entitlements wait for verified webhooks.
    return { success: true, url: session.url };
  } catch (error) {
    if (
      error instanceof BillingProviderNotConfiguredError ||
      error instanceof BillingNotImplementedError ||
      error instanceof BillingCheckoutPlanError ||
      error instanceof BillingCheckoutUrlError
    ) {
      return { error: error.message };
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to start checkout.",
    };
  }
}

export async function openCustomerPortalAction(): Promise<BillingActionState> {
  try {
    const { church } = await requireBillingManageAccess();
    const provider = getBillingProvider();
    if (!provider.isConfigured() || !provider.capabilities().customerPortal) {
      return {
        error:
          "Customer portal is not available yet. A billing provider adapter must be connected first.",
      };
    }

    const headerStore = await headers();
    const origin = resolveAppOrigin({
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      forwardedHost: headerStore.get("x-forwarded-host"),
      host: headerStore.get("host"),
      forwardedProto: headerStore.get("x-forwarded-proto"),
    });
    const session = await provider.createCustomerPortalSession({
      organizationId: church.id,
      returnUrl: `${origin}/settings/billing`,
    });
    return { success: true, url: session.url };
  } catch (error) {
    if (
      error instanceof BillingProviderNotConfiguredError ||
      error instanceof BillingNotImplementedError
    ) {
      return { error: error.message };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to open customer portal.",
    };
  }
}

/**
 * Manual plan assignment for owners while no payment provider is connected.
 * When a provider is live, prefer checkout / portal instead.
 */
export async function applyPlanWithoutProviderAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
    const { church, user } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required to update subscriptions.",
      };
    }

    const planKey = String(formData.get("plan_key") ?? "").trim();
    const confirmed = String(formData.get("confirmed") ?? "") === "1";
    if (!planKey) return { error: "Select a plan." };

    const impact = await buildDowngradeImpactReport({
      organizationId: church.id,
      targetPlanKey: planKey,
    });

    if (impact.isSamePlan) {
      return { success: true, message: "Already on this plan.", impact };
    }

    if (impact.isDowngrade && !confirmed) {
      return {
        error: "Confirm the downgrade impact before applying this plan.",
        impact,
      };
    }

    await changeChurchSubscriptionPlan({
      organizationId: church.id,
      planKey,
      status: "active",
      userId: user.id,
      source: "billing_settings_manual",
      reason: impact.isDowngrade
        ? "Manual plan downgrade from billing settings (no provider)"
        : "Manual plan change from billing settings (no provider)",
      allowDowngrade: impact.isDowngrade,
    });

    revalidatePath("/settings/billing");
    revalidatePath("/", "layout");
    return {
      success: true,
      message: `Plan updated to ${impact.toPlanDisplayName}.`,
      impact,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update plan.",
    };
  }
}

export async function requestCancellationAction(
  _prev: BillingActionState,
  formData: FormData,
): Promise<BillingActionState> {
  try {
    const { church, user } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required to update subscriptions.",
      };
    }

    const confirmed = String(formData.get("confirmed") ?? "") === "1";
    if (!confirmed) {
      return { error: "Confirm cancellation to continue." };
    }

    const provider = getBillingProvider();
    if (provider.isConfigured() && provider.capabilities().cancelAtProvider) {
      return {
        error:
          "Use the customer portal to cancel when a billing provider is connected.",
      };
    }

    // Soft-cancel at period end until a provider owns lifecycle.
    const result = await scheduleChurchSubscriptionCancellation({
      organizationId: church.id,
      userId: user.id,
      source: "billing_settings_manual",
      reason: "Cancel at period end requested from billing settings (no provider)",
    });

    revalidatePath("/settings/billing");
    revalidatePath("/", "layout");
    return {
      success: true,
      message: result.subscription.current_period_end
        ? `Cancellation scheduled. Access continues until ${new Date(result.subscription.current_period_end).toLocaleDateString()}. Church data is preserved.`
        : "Cancellation scheduled at period end. Church data is preserved.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to cancel subscription.",
    };
  }
}

const CURRENT_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "grace_period",
  "incomplete",
] as const;

function upgradeActionError(error: unknown): string {
  if (
    error instanceof ChurchAccessError ||
    error instanceof BillingConfigurationError ||
    error instanceof BillingUpgradeError ||
    error instanceof BillingProviderNotConfiguredError
  ) {
    return error.message;
  }
  return upgradeFailureMessage(error);
}

async function loadLocalUpgradeSubscription(
  organizationId: string,
): Promise<LocalUpgradeSubscription> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select(
      `
      billing_provider,
      billing_customer_id,
      billing_subscription_id,
      subscription_plans!inner ( plan_key )
    `,
    )
    .eq("organization_id", organizationId)
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new BillingUpgradeError(
      "A connected Stripe subscription is required before a plan can be upgraded.",
    );
  }

  const row = data as Record<string, unknown>;
  const plan = row.subscription_plans as Record<string, unknown> | null;
  const planKey = String(plan?.plan_key ?? "");
  const customerId =
    typeof row.billing_customer_id === "string" ? row.billing_customer_id.trim() : "";
  const subscriptionId =
    typeof row.billing_subscription_id === "string"
      ? row.billing_subscription_id.trim()
      : "";
  if (!isPlanKey(planKey) || !customerId || !subscriptionId) {
    throw new BillingUpgradeError(
      "A connected Stripe subscription is required before a plan can be upgraded.",
    );
  }
  return {
    planKey,
    billingProvider:
      typeof row.billing_provider === "string" ? row.billing_provider : null,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
  };
}

function assertStripeUpgradeProvider(): void {
  if (getConfiguredBillingProviderId() !== "stripe") {
    throw new BillingUpgradeError("This organization is not billed through Stripe.");
  }
  const provider = getBillingProvider();
  if (!provider.isConfigured()) {
    throw new BillingProviderNotConfiguredError(
      "Stripe billing is not configured.",
    );
  }
}

export async function previewSubscriptionUpgradeAction(
  planKey: string,
): Promise<BillingActionState> {
  try {
    const { church } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required to read billing.",
      };
    }
    assertStripeUpgradeProvider();
    const targetPlanKey = assertClientUpgradePayload({ plan_key: planKey });
    const local = await loadLocalUpgradeSubscription(church.id);
    const preview = await previewSubscriptionUpgrade({
      local,
      targetPlanKey,
      deps: createStripeUpgradeDeps(requireStripeSecretKey()),
    });
    return { success: true, upgradePreview: preview };
  } catch (error) {
    console.error(JSON.stringify(safeStripePreviewErrorLog(error)));
    return { error: previewFailureMessage(error) };
  }
}

export async function confirmSubscriptionUpgradeAction(
  planKey: string,
): Promise<BillingActionState> {
  try {
    const { church } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required to read billing.",
      };
    }
    assertStripeUpgradeProvider();
    const targetPlanKey = assertClientUpgradePayload({ plan_key: planKey });
    const local = await loadLocalUpgradeSubscription(church.id);
    await confirmSubscriptionUpgrade({
      local,
      targetPlanKey,
      deps: createStripeUpgradeDeps(requireStripeSecretKey()),
    });
    revalidatePath("/settings/billing");
    return {
      success: true,
      message:
        "Upgrade payment succeeded. Your plan updates when Stripe billing sync completes.",
    };
  } catch (error) {
    return { error: upgradeActionError(error) };
  }
}

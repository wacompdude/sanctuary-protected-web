"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  BillingCheckoutPlanError,
  BillingCheckoutUrlError,
  BillingConfigurationError,
  BillingDowngradeError,
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
import { createStripeDowngradeDeps } from "@/lib/billing/stripe/downgrade-live";
import {
  assertCancellationAllowed,
  assertClientDowngradePayload,
  downgradeFailureMessage,
  releaseScheduledDowngrade,
  safeStripeDowngradeErrorLog,
  scheduleSubscriptionDowngrade,
  DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE,
} from "@/lib/billing/stripe/downgrade";
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

    const scheduleStatus = await readScheduleStatus(church.id);
    try {
      assertCancellationAllowed(scheduleStatus);
    } catch (error) {
      return {
        error:
          error instanceof BillingDowngradeError
            ? error.message
            : DOWNGRADE_CANCELLATION_CONFLICT_MESSAGE,
      };
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
      cancel_at_period_end,
      schedule_status,
      subscription_plans!church_subscriptions_plan_id_fkey!inner ( plan_key )
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
    activeDowngradeSchedule: row.schedule_status === "scheduled",
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

export async function scheduleSubscriptionDowngradeAction(
  planKey: string,
): Promise<BillingActionState> {
  try {
    const { church, user } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required to update billing.",
      };
    }
    assertStripeUpgradeProvider();
    const targetPlanKey = assertClientDowngradePayload({ plan_key: planKey });
    const local = await loadLocalDowngradeSubscription(church.id);
    await scheduleSubscriptionDowngrade({
      local,
      targetPlanKey,
      requestedBy: user.id,
      deps: createStripeDowngradeDeps(requireStripeSecretKey(), {
        saveScheduledMirror: (mirror) =>
          saveScheduledDowngradeMirror(church.id, local.billingSubscriptionId, mirror),
        saveReleasedMirror: async () => undefined,
      }),
    });
    revalidatePath("/settings/billing");
    return {
      success: true,
      message:
        "Downgrade scheduled. Your current plan stays active until the renewal date.",
    };
  } catch (error) {
    console.error(JSON.stringify(safeStripeDowngradeErrorLog(error)));
    return { error: downgradeFailureMessage(error) };
  }
}

export async function cancelScheduledDowngradeAction(): Promise<BillingActionState> {
  try {
    const { church } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return {
        error:
          "Server is missing SUPABASE_SERVICE_ROLE_KEY required to update billing.",
      };
    }
    assertStripeUpgradeProvider();
    const local = await loadLocalDowngradeSubscription(church.id);
    await releaseScheduledDowngrade({
      local,
      deps: createStripeDowngradeDeps(requireStripeSecretKey(), {
        saveScheduledMirror: async () => undefined,
        saveReleasedMirror: (mirror) =>
          saveReleasedDowngradeMirror(church.id, local.billingSubscriptionId, mirror),
      }),
    });
    revalidatePath("/settings/billing");
    return {
      success: true,
      message: "Scheduled downgrade canceled. Your current plan will continue.",
    };
  } catch (error) {
    console.error(JSON.stringify(safeStripeDowngradeErrorLog(error)));
    return { error: downgradeFailureMessage(error) };
  }
}

async function readScheduleStatus(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_subscriptions")
    .select("schedule_status")
    .eq("organization_id", organizationId)
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof data?.schedule_status === "string" ? data.schedule_status : null;
}

async function loadLocalDowngradeSubscription(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select(
      `
      id,
      billing_provider,
      billing_customer_id,
      billing_subscription_id,
      cancel_at_period_end,
      schedule_status,
      subscription_plans!church_subscriptions_plan_id_fkey!inner ( plan_key )
    `,
    )
    .eq("organization_id", organizationId)
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw new BillingDowngradeError(
      "A connected Stripe subscription is required before a downgrade can be scheduled.",
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
    throw new BillingDowngradeError(
      "A connected Stripe subscription is required before a downgrade can be scheduled.",
    );
  }
  return {
    subscriptionRowId: String(row.id),
    planKey,
    billingProvider:
      typeof row.billing_provider === "string" ? row.billing_provider : null,
    billingCustomerId: customerId,
    billingSubscriptionId: subscriptionId,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    activeDowngradeSchedule: row.schedule_status === "scheduled",
  };
}

async function saveScheduledDowngradeMirror(
  organizationId: string,
  billingSubscriptionId: string,
  mirror: {
    providerScheduleId: string;
    scheduledPlanKey: string;
    scheduledEffectiveAt: string;
    requestedBy: string | null;
  },
): Promise<void> {
  const admin = createAdminClient();
  const { data: plan, error: planError } = await admin
    .from("subscription_plans")
    .select("id")
    .eq("plan_key", mirror.scheduledPlanKey)
    .maybeSingle();
  if (planError || !plan?.id) {
    throw new BillingDowngradeError(
      "The scheduled plan could not be saved. Your current plan was not changed.",
    );
  }
  const { error } = await admin
    .from("organization_subscriptions")
    .update({
      provider_schedule_id: mirror.providerScheduleId,
      scheduled_plan_id: plan.id,
      scheduled_effective_at: mirror.scheduledEffectiveAt,
      schedule_status: "scheduled",
      schedule_requested_by: mirror.requestedBy,
      schedule_requested_at: new Date().toISOString(),
      schedule_released_at: null,
    })
    .eq("organization_id", organizationId)
    .eq("billing_subscription_id", billingSubscriptionId);
  if (error) {
    throw new BillingDowngradeError(
      "The scheduled plan could not be saved. Your current plan was not changed.",
    );
  }
}

async function saveReleasedDowngradeMirror(
  organizationId: string,
  billingSubscriptionId: string,
  mirror: { providerScheduleId: string; scheduleReleasedAt: string },
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_subscriptions")
    .update({
      schedule_status: "released",
      schedule_released_at: mirror.scheduleReleasedAt,
      ...(mirror.providerScheduleId
        ? { provider_schedule_id: mirror.providerScheduleId }
        : {}),
    })
    .eq("organization_id", organizationId)
    .eq("billing_subscription_id", billingSubscriptionId);
  if (error) {
    throw new BillingDowngradeError(
      "The scheduled downgrade was released, but the billing display could not be updated. Refresh and try again.",
    );
  }
}


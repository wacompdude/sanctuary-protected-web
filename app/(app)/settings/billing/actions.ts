"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  BillingProviderNotConfiguredError,
  buildDowngradeImpactReport,
  getBillingProvider,
} from "@/lib/billing";
import { requireMinChurchRole } from "@/lib/church/auth";
import { isPlanKey } from "@/lib/subscriptions/plan-keys";
import {
  changeChurchSubscriptionPlan,
  scheduleChurchSubscriptionCancellation,
} from "@/lib/subscriptions/mutations";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import type { DowngradeImpactReport } from "@/lib/billing/types";

export type BillingActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  url?: string;
  impact?: DowngradeImpactReport;
};

function appOriginFromHeaders(headerStore: Headers): string {
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const proto = headerStore.get("x-forwarded-proto") || "http";
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "");
  }
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

export async function previewPlanChangeImpactAction(
  planKey: string,
): Promise<BillingActionState> {
  try {
    const { church } = await requireMinChurchRole("owner");
    if (!isPlanKey(planKey) && !planKey.trim()) {
      return { error: "Select a valid plan." };
    }
    const impact = await buildDowngradeImpactReport({
      churchId: church.id,
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
    const { church, user } = await requireMinChurchRole("owner");
    const planKey = String(formData.get("plan_key") ?? "").trim();
    if (!planKey) return { error: "Select a plan to continue." };

    const provider = getBillingProvider();
    if (!provider.isConfigured()) {
      return {
        error:
          "Checkout is not available yet. A billing provider adapter must be connected first.",
      };
    }

    const headerStore = await headers();
    const origin = appOriginFromHeaders(headerStore);
    const session = await provider.createCheckoutSession({
      churchId: church.id,
      planKey,
      successUrl: `${origin}/settings/billing?checkout=success`,
      cancelUrl: `${origin}/settings/billing?checkout=cancelled`,
      customerEmail: user.email,
    });

    return { success: true, url: session.url };
  } catch (error) {
    if (error instanceof BillingProviderNotConfiguredError) {
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
    const { church } = await requireMinChurchRole("owner");
    const provider = getBillingProvider();
    if (!provider.isConfigured()) {
      return {
        error:
          "Customer portal is not available yet. A billing provider adapter must be connected first.",
      };
    }

    const headerStore = await headers();
    const origin = appOriginFromHeaders(headerStore);
    const session = await provider.createCustomerPortalSession({
      churchId: church.id,
      returnUrl: `${origin}/settings/billing`,
    });
    return { success: true, url: session.url };
  } catch (error) {
    if (error instanceof BillingProviderNotConfiguredError) {
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
    const { church, user } = await requireMinChurchRole("owner");
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
      churchId: church.id,
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
      churchId: church.id,
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
    const { church, user } = await requireMinChurchRole("owner");
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
      churchId: church.id,
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

"use server";

import { revalidatePath } from "next/cache";
import { smsPackageForPlan } from "@/lib/billing/commercial-catalog";
import { requireBillingManageAccess } from "@/lib/billing/access";
import { readOrganizationBillingAddress } from "@/lib/billing/organization-billing-address";
import {
  SMS_AUTO_REPLENISHMENT_TEXT_VERSION,
  evaluateSmsAutoReplenishmentEnable,
} from "@/lib/billing/sms-auto-replenishment";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { ChurchAccessError } from "@/lib/organization/errors";
import { getChurchSubscription } from "@/lib/subscriptions";

export type SmsAutoReplenishmentActionResult = {
  error?: string;
  ok?: boolean;
};

function integerField(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function configure(input: {
  organizationId: string;
  actorUserId: string;
  action: "enable" | "disable" | "resume" | "reauthorize";
  threshold: number | null;
  capCents: number | null;
  paymentMethodId: string | null;
  authorizationVersion: string | null;
}): Promise<Record<string, unknown>> {
  if (!isServiceRoleConfigured()) {
    return { ok: false, outcome: "unavailable" };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("configure_application_sms_auto_replenishment", {
    p_organization_id: input.organizationId,
    p_actor_user_id: input.actorUserId,
    p_action: input.action,
    p_threshold_segments: input.threshold,
    p_max_auto_spend_cents: input.capCents,
    p_payment_method_id: input.paymentMethodId,
    p_authorization_text_version: input.authorizationVersion,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, outcome: "unavailable" };
  }
  return data as Record<string, unknown>;
}

function configurationError(outcome: string): string {
  switch (outcome) {
    case "forbidden":
      return "You do not have permission to manage billing.";
    case "payment_method_missing":
      return "Save an automatic SMS payment method before enabling replenishment.";
    case "authorization_required":
      return "Check the authorization box before continuing.";
    case "threshold_invalid":
    case "configuration_invalid":
      return "The threshold or spending limit is not valid for the current SMS package.";
    case "spending_cap_invalid":
      return "Choose a spending limit that can cover the current package.";
    case "not_active":
    case "sms_not_entitled":
      return "Automatic replenishment requires an active subscription with Application SMS.";
    case "authorization_review_required":
      return "The current package price is higher than the price you authorized. Review it before continuing.";
    case "payment_attention_required":
      return "Update the automatic SMS payment method, then resume replenishment.";
    default:
      return "Automatic replenishment was not changed.";
  }
}

async function savedPaymentMethodId(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_sms_auto_replenishment")
    .select("payment_method_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return typeof data?.payment_method_id === "string" ? data.payment_method_id : null;
}

export async function enableSmsAutoReplenishmentAction(
  formData: FormData,
): Promise<SmsAutoReplenishmentActionResult> {
  try {
    const { church, user, membership } = await requireBillingManageAccess();
    const subscription = await getChurchSubscription(church.id);
    const plan = subscription ? smsPackageForPlan(String(subscription.plan_key)) : undefined;
    const paymentMethodId = await savedPaymentMethodId(church.id);
    const decision = evaluateSmsAutoReplenishmentEnable({
      role: membership.role,
      authorizationAccepted: formData.get("authorization") === "on",
      threshold: integerField(formData.get("threshold")) ?? Number.NaN,
      capCents: integerField(formData.get("spending_cap_cents")) ?? Number.NaN,
      packageSegments: plan?.smsPackageCredits ?? 0,
      packagePriceCents: plan?.smsPackagePriceCents ?? 0,
      hasPaymentMethod: Boolean(paymentMethodId),
    });
    if (!decision.ok) {
      return { error: configurationError(decision.reason) };
    }
    const result = await configure({
      organizationId: church.id,
      actorUserId: user.id,
      action: "enable",
      threshold: integerField(formData.get("threshold")),
      capCents: integerField(formData.get("spending_cap_cents")),
      paymentMethodId,
      authorizationVersion: SMS_AUTO_REPLENISHMENT_TEXT_VERSION,
    });
    if (result.ok !== true) {
      return { error: configurationError(String(result.outcome ?? "")) };
    }
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Automatic replenishment was not enabled." };
  }
}

export async function disableSmsAutoReplenishmentAction(): Promise<SmsAutoReplenishmentActionResult> {
  try {
    const { church, user } = await requireBillingManageAccess();
    const result = await configure({
      organizationId: church.id,
      actorUserId: user.id,
      action: "disable",
      threshold: null,
      capCents: null,
      paymentMethodId: null,
      authorizationVersion: null,
    });
    if (result.ok !== true) {
      return { error: configurationError(String(result.outcome ?? "")) };
    }
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Automatic replenishment was not turned off." };
  }
}

export async function resumeSmsAutoReplenishmentAction(): Promise<SmsAutoReplenishmentActionResult> {
  try {
    const { church, user } = await requireBillingManageAccess();
    const result = await configure({
      organizationId: church.id,
      actorUserId: user.id,
      action: "resume",
      threshold: null,
      capCents: null,
      paymentMethodId: null,
      authorizationVersion: null,
    });
    if (result.ok !== true) {
      return { error: configurationError(String(result.outcome ?? "")) };
    }
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Automatic replenishment was not resumed." };
  }
}

export async function reauthorizeSmsAutoReplenishmentAction(
  formData: FormData,
): Promise<SmsAutoReplenishmentActionResult> {
  try {
    const { church, user, membership } = await requireBillingManageAccess();
    if (membership.role !== "owner" && membership.role !== "co_owner") {
      return { error: configurationError("forbidden") };
    }
    if (formData.get("authorization") !== "on") {
      return { error: configurationError("authorization_required") };
    }
    const result = await configure({
      organizationId: church.id,
      actorUserId: user.id,
      action: "reauthorize",
      threshold: null,
      capCents: null,
      paymentMethodId: null,
      authorizationVersion: SMS_AUTO_REPLENISHMENT_TEXT_VERSION,
    });
    if (result.ok !== true) {
      return { error: configurationError(String(result.outcome ?? "")) };
    }
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Automatic replenishment was not reauthorized." };
  }
}

export async function resolveSmsAutoReplenishmentTaxAttentionAction(): Promise<SmsAutoReplenishmentActionResult> {
  try {
    const { church, user } = await requireBillingManageAccess();
    if (!isServiceRoleConfigured()) {
      return { error: "Automatic replenishment was not resumed." };
    }
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("organization_billing_profiles")
      .select("billing_address")
      .eq("organization_id", church.id)
      .maybeSingle();
    if (!readOrganizationBillingAddress(profile?.billing_address)) {
      return {
        error:
          "Add a complete billing address in Settings → Billing → Billing & Tax Address before resuming.",
      };
    }
    const { data, error } = await admin.rpc(
      "resolve_application_sms_replenishment_tax_attention",
      {
        p_organization_id: church.id,
        p_actor_user_id: user.id,
      },
    );
    const result =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as { ok?: boolean; outcome?: string })
        : null;
    if (error || result?.ok !== true) {
      if (result?.outcome === "forbidden") {
        return { error: configurationError("forbidden") };
      }
      return { error: "Automatic replenishment was not resumed." };
    }
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Automatic replenishment was not resumed." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { BillingConfigurationError } from "@/lib/billing/errors";
import { requireBillingManageAccess } from "@/lib/billing/access";
import { requireStripePublishableKey } from "@/lib/billing/stripe/config";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import { resolveAppOrigin } from "@/lib/billing/stripe/checkout-urls";
import {
  readSetupIntentIdFromClient,
  type SafeCardDisplay,
} from "@/lib/billing/stripe/sms-payment-setup";
import {
  createSmsAutoReplenishmentSetupIntent,
  resolveCanonicalStripeCustomer,
  verifyCompletedSmsPaymentSetup,
} from "@/lib/billing/stripe/sms-payment-setup-live";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { ChurchAccessError } from "@/lib/organization/errors";

export type SmsPaymentSetupActionResult = {
  error?: string;
  clientSecret?: string;
  setupIntentId?: string;
  publishableKey?: string;
  returnUrl?: string;
  saved?: boolean;
  removed?: boolean;
  status?: string;
  display?: SafeCardDisplay | null;
};

function failureMessage(error: unknown): string {
  if (error instanceof ChurchAccessError || error instanceof BillingConfigurationError) {
    return error.message;
  }
  return "Unable to update the automatic SMS payment method.";
}

async function currentPaymentMethodId(organizationId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_sms_auto_replenishment")
    .select("payment_method_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return typeof data?.payment_method_id === "string" ? data.payment_method_id : null;
}

async function recordPaymentMethod(input: {
  organizationId: string;
  actorUserId: string;
  paymentMethodId: string | null;
}): Promise<{ status: string; enabled: boolean }> {
  if (!isServiceRoleConfigured()) {
    throw new BillingConfigurationError("SUPABASE_SERVICE_ROLE_KEY is required.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "record_application_sms_replenishment_payment_method",
    {
      p_organization_id: input.organizationId,
      p_actor_user_id: input.actorUserId,
      p_payment_method_id: input.paymentMethodId,
    },
  );
  if (error) {
    throw new BillingConfigurationError("Unable to save the payment-method reference.");
  }
  const result = data as { ok?: boolean; outcome?: string; status?: string } | null;
  if (!result?.ok) {
    if (result?.outcome === "forbidden") {
      throw new ChurchAccessError(
        "You do not have permission to manage billing.",
        "FORBIDDEN_ROLE",
      );
    }
    throw new BillingConfigurationError("Unable to save the payment-method reference.");
  }
  return {
    status: result.status ?? "disabled",
    enabled: result.status === "enabled",
  };
}

export async function startSmsPaymentSetupAction(): Promise<SmsPaymentSetupActionResult> {
  try {
    const { church } = await requireBillingManageAccess();
    const publishableKey = requireStripePublishableKey();
    const customerId = await resolveCanonicalStripeCustomer(church.id);
    const current = await currentPaymentMethodId(church.id);
    const setup = await createSmsAutoReplenishmentSetupIntent({
      organizationId: church.id,
      customerId,
      currentPaymentMethodId: current,
    });
    const headerStore = await headers();
    const origin = resolveAppOrigin({
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      forwardedHost: headerStore.get("x-forwarded-host"),
      host: headerStore.get("host"),
      forwardedProto: headerStore.get("x-forwarded-proto"),
    });
    return {
      clientSecret: setup.clientSecret,
      setupIntentId: setup.setupIntentId,
      publishableKey,
      returnUrl: `${origin}/settings/billing`,
    };
  } catch (error) {
    logStripeBillingError("sms_payment_setup_create", error);
    if (error instanceof ChurchAccessError || error instanceof BillingConfigurationError) {
      return { error: error.message };
    }
    return { error: "Unable to set up the automatic SMS payment method." };
  }
}

export async function finalizeSmsPaymentSetupAction(
  setupIntentId: string,
): Promise<SmsPaymentSetupActionResult> {
  try {
    const setupId = readSetupIntentIdFromClient(setupIntentId);
    if (!setupId) {
      return { error: "Stripe did not return a completed setup." };
    }
    const { church, user } = await requireBillingManageAccess();
    const customerId = await resolveCanonicalStripeCustomer(church.id);
    const verified = await verifyCompletedSmsPaymentSetup({
      organizationId: church.id,
      customerId,
      setupIntentId: setupId,
    });
    if (!verified.ok) {
      return { error: "The payment method could not be verified." };
    }
    const saved = await recordPaymentMethod({
      organizationId: church.id,
      actorUserId: user.id,
      paymentMethodId: verified.paymentMethodId,
    });
    revalidatePath("/settings/billing");
    return {
      saved: true,
      status: saved.status,
      display: verified.display,
    };
  } catch (error) {
    return { error: failureMessage(error) };
  }
}

export async function removeSmsPaymentSetupAction(): Promise<SmsPaymentSetupActionResult> {
  try {
    const { church, user } = await requireBillingManageAccess();
    const saved = await recordPaymentMethod({
      organizationId: church.id,
      actorUserId: user.id,
      paymentMethodId: null,
    });
    revalidatePath("/settings/billing");
    return { removed: true, status: saved.status };
  } catch (error) {
    return { error: failureMessage(error) };
  }
}

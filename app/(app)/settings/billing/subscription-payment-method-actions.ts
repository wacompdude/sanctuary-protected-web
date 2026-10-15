"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { BillingConfigurationError } from "@/lib/billing/errors";
import { requireBillingManageAccess } from "@/lib/billing/access";
import { requireStripePublishableKey } from "@/lib/billing/stripe/config";
import { resolveAppOrigin } from "@/lib/billing/stripe/checkout-urls";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import { readSetupIntentIdFromClient } from "@/lib/billing/stripe/sms-payment-setup";
import type { SafeCardDisplay } from "@/lib/billing/stripe/sms-payment-setup";
import {
  createSubscriptionPaymentMethodSetup,
  finalizeSubscriptionPaymentMethodSetup,
} from "@/lib/billing/stripe/subscription-payment-method-live";
import { ChurchAccessError } from "@/lib/organization/errors";

export type SubscriptionPaymentMethodActionResult = {
  error?: string;
  clientSecret?: string;
  publishableKey?: string;
  returnUrl?: string;
  saved?: boolean;
  display?: SafeCardDisplay | null;
};

export async function startSubscriptionPaymentMethodSetupAction(): Promise<SubscriptionPaymentMethodActionResult> {
  try {
    const { church } = await requireBillingManageAccess();
    const publishableKey = requireStripePublishableKey();
    const setup = await createSubscriptionPaymentMethodSetup({
      organizationId: church.id,
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
      publishableKey,
      returnUrl: `${origin}${setup.returnPath}`,
    };
  } catch (error) {
    logStripeBillingError("subscription_payment_method_setup_create", error);
    if (error instanceof ChurchAccessError || error instanceof BillingConfigurationError) {
      return { error: error.message };
    }
    return { error: "Unable to start subscription payment method setup." };
  }
}

export async function finalizeSubscriptionPaymentMethodSetupAction(
  setupIntentId: string,
): Promise<SubscriptionPaymentMethodActionResult> {
  try {
    const setupId = readSetupIntentIdFromClient(setupIntentId);
    if (!setupId) return { error: "Stripe did not return a completed setup." };
    const { church, user } = await requireBillingManageAccess();
    const saved = await finalizeSubscriptionPaymentMethodSetup({
      organizationId: church.id,
      actorUserId: user.id,
      setupIntentId: setupId,
    });
    revalidatePath("/settings/billing");
    return { saved: true, display: saved.display };
  } catch (error) {
    logStripeBillingError("subscription_payment_method_setup_finalize", error);
    if (error instanceof ChurchAccessError || error instanceof BillingConfigurationError) {
      return { error: error.message };
    }
    return { error: "The subscription payment method could not be saved." };
  }
}

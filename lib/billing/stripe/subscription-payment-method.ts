/**
 * Base-subscription payment-method replacement rules.
 * Does not call Stripe, change SMS replenishment, or collect card data.
 */

import { SMS_PAYMENT_SETUP_PURPOSE } from "@/lib/billing/stripe/sms-payment-setup";
import type {
  PaymentMethodVerificationSnapshot,
  SafeCardDisplay,
  SetupIntentVerificationSnapshot,
} from "@/lib/billing/stripe/sms-payment-setup";
import {
  isStripePaymentMethodId,
  safeCardDisplay,
} from "@/lib/billing/stripe/sms-payment-setup";

export const SUBSCRIPTION_PAYMENT_METHOD_PURPOSE =
  "subscription_payment_method_replacement";

export const SUBSCRIPTION_PAYMENT_METHOD_ROLES = ["owner", "co_owner"] as const;

export type SubscriptionPaymentMethodView =
  | { state: "no_subscription" }
  | { state: "missing" }
  | { state: "ready"; display: SafeCardDisplay | null }
  | { state: "unavailable" };

export function canReplaceSubscriptionPaymentMethod(role: string | null): boolean {
  return (
    role != null &&
    (SUBSCRIPTION_PAYMENT_METHOD_ROLES as readonly string[]).includes(role)
  );
}

/** The payment method Stripe will charge on the next subscription invoice. */
export function effectiveSubscriptionPaymentMethodId(input: {
  subscriptionDefaultPaymentMethodId?: string | null;
  customerInvoiceDefaultPaymentMethodId?: string | null;
}): string | null {
  const subscriptionDefault = input.subscriptionDefaultPaymentMethodId?.trim() || "";
  if (subscriptionDefault) return subscriptionDefault;
  const customerDefault = input.customerInvoiceDefaultPaymentMethodId?.trim() || "";
  return customerDefault || null;
}

export function subscriptionPaymentMethodSetupParams(input: {
  customerId: string;
  organizationId: string;
  subscriptionId: string;
}): {
  customer: string;
  usage: "off_session";
  allowed_payment_method_types: ["card"];
  metadata: {
    sanctuary_purpose: typeof SUBSCRIPTION_PAYMENT_METHOD_PURPOSE;
    organization_id: string;
    subscription_id: string;
  };
} {
  return {
    customer: input.customerId,
    usage: "off_session",
    allowed_payment_method_types: ["card"],
    metadata: {
      sanctuary_purpose: SUBSCRIPTION_PAYMENT_METHOD_PURPOSE,
      organization_id: input.organizationId,
      subscription_id: input.subscriptionId,
    },
  };
}

export function subscriptionPaymentMethodSetupIdempotencyKey(
  organizationId: string,
  currentPaymentMethodId: string | null,
): string {
  const current = currentPaymentMethodId?.trim() || "none";
  return `subscription_pm_setup_v1_${organizationId}_${current}`;
}

/** The only field this workflow sends to subscriptions.update. */
export function subscriptionDefaultPaymentMethodUpdate(paymentMethodId: string): {
  default_payment_method: string;
} {
  return { default_payment_method: paymentMethodId };
}

export function verifySubscriptionPaymentMethodSetup(input: {
  organizationId: string;
  customerId: string;
  subscriptionId: string;
  setupIntent: SetupIntentVerificationSnapshot | null;
  paymentMethod: PaymentMethodVerificationSnapshot | null;
  setupSubscriptionId: string | null;
}):
  | { ok: true; paymentMethodId: string; display: SafeCardDisplay | null }
  | { ok: false; outcome: string } {
  const setupIntent = input.setupIntent;
  if (!setupIntent) return { ok: false, outcome: "setup_intent_missing" };
  if (setupIntent.purpose === SMS_PAYMENT_SETUP_PURPOSE) {
    return { ok: false, outcome: "sms_setup_intent" };
  }
  if (setupIntent.purpose !== SUBSCRIPTION_PAYMENT_METHOD_PURPOSE) {
    return { ok: false, outcome: "wrong_purpose" };
  }
  if (setupIntent.customerId !== input.customerId) {
    return { ok: false, outcome: "wrong_customer" };
  }
  if (setupIntent.organizationId !== input.organizationId) {
    return { ok: false, outcome: "wrong_organization" };
  }
  if (input.setupSubscriptionId !== input.subscriptionId) {
    return { ok: false, outcome: "wrong_subscription" };
  }
  if (setupIntent.usage !== "off_session") {
    return { ok: false, outcome: "not_off_session" };
  }
  if (setupIntent.status !== "succeeded") {
    return { ok: false, outcome: "not_succeeded" };
  }
  if (!setupIntent.paymentMethodId || !isStripePaymentMethodId(setupIntent.paymentMethodId)) {
    return { ok: false, outcome: "payment_method_missing" };
  }
  const paymentMethod = input.paymentMethod;
  if (!paymentMethod || paymentMethod.id !== setupIntent.paymentMethodId) {
    return { ok: false, outcome: "payment_method_missing" };
  }
  if (paymentMethod.type !== "card") {
    return { ok: false, outcome: "unsupported_payment_method" };
  }
  if (paymentMethod.customerId !== input.customerId) {
    return { ok: false, outcome: "payment_method_customer_mismatch" };
  }
  return {
    ok: true,
    paymentMethodId: paymentMethod.id,
    display: safeCardDisplay(paymentMethod),
  };
}

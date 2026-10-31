/**
 * Server Stripe calls for base-subscription payment-method replacement.
 * Retrieves and updates only subscription.default_payment_method.
 * Does not create charges, invoices, or customer address changes.
 */

import "server-only";

import type Stripe from "stripe";
import { AuditAction } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import { BillingConfigurationError } from "@/lib/billing/errors";
import { getStripeClient } from "@/lib/billing/stripe/client";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import {
  safeCardDisplay,
  type SafeCardDisplay,
  type SetupIntentVerificationSnapshot,
} from "@/lib/billing/stripe/sms-payment-setup";
import {
  effectiveSubscriptionPaymentMethodId,
  subscriptionDefaultPaymentMethodUpdate,
  subscriptionPaymentMethodSetupIdempotencyKey,
  subscriptionPaymentMethodSetupParams,
  verifySubscriptionPaymentMethodSetup,
  type SubscriptionPaymentMethodView,
} from "@/lib/billing/stripe/subscription-payment-method";
import {
  isAuthoritativeLiveStripeMode,
  normalizeProviderMode,
} from "@/lib/billing/stripe/provider-mode";
import { CURRENT_SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/status";
import { createAdminClient } from "@/lib/supabase/admin";

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

function paymentMethodIdOf(
  paymentMethod: string | Stripe.PaymentMethod | null,
): string | null {
  if (!paymentMethod) return null;
  if (typeof paymentMethod === "string") return paymentMethod;
  return paymentMethod.id;
}

async function canonicalBillingTarget(organizationId: string): Promise<{
  subscriptionId: string | null;
  customerId: string | null;
}> {
  const admin = createAdminClient();
  const { data: subscriptions } = await admin
    .from("organization_subscriptions")
    .select("provider_mode, billing_provider, billing_subscription_id")
    .eq("organization_id", organizationId)
    .in("status", [...CURRENT_SUBSCRIPTION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(20);
  const { data: profile } = await admin
    .from("organization_billing_profiles")
    .select("provider_customer_id, provider_mode")
    .eq("organization_id", organizationId)
    .eq("billing_provider", "stripe")
    .maybeSingle();
  const { data: legacyCustomer } = await admin
    .from("billing_customers")
    .select("provider_customer_id, provider_mode")
    .eq("organization_id", organizationId)
    .eq("billing_provider", "stripe")
    .maybeSingle();

  // Subscription must be an authoritative Live Stripe row. Test/NULL rows are
  // never a payment-method replacement target.
  const liveSubscription = (subscriptions ?? []).find((row) => {
    const id =
      typeof row.billing_subscription_id === "string"
        ? row.billing_subscription_id.trim()
        : "";
    return (
      Boolean(id) &&
      String(row.billing_provider ?? "").trim().toLowerCase() === "stripe" &&
      isAuthoritativeLiveStripeMode(
        typeof row.provider_mode === "string" ? row.provider_mode : null,
      )
    );
  });
  const subscriptionId =
    typeof liveSubscription?.billing_subscription_id === "string"
      ? liveSubscription.billing_subscription_id.trim()
      : "";

  // Customer mapping: never Test; prefer Live, then unclassified (NULL).
  // The Stripe subscription/customer livemode + ownership checks below still apply.
  const customerCandidates = [profile, legacyCustomer]
    .map((row) => ({
      id:
        typeof row?.provider_customer_id === "string"
          ? row.provider_customer_id.trim()
          : "",
      mode: normalizeProviderMode(row?.provider_mode),
    }))
    .filter((candidate) => candidate.id && candidate.mode !== "test");
  const customerId =
    customerCandidates.find((candidate) => candidate.mode === "live")?.id ??
    customerCandidates[0]?.id ??
    "";
  return {
    subscriptionId: subscriptionId || null,
    customerId: customerId || null,
  };
}

/** Stripe subscription.livemode must be true when Stripe supplies it. */
function isLiveStripeSubscriptionObject(
  subscription: Stripe.Subscription,
): boolean {
  return (subscription as { livemode?: boolean }).livemode !== false;
}

function snapshotCard(paymentMethod: Stripe.PaymentMethod): SafeCardDisplay | null {
  if (paymentMethod.type !== "card" || !paymentMethod.card) return null;
  return safeCardDisplay({
    id: paymentMethod.id,
    type: paymentMethod.type,
    customerId: customerIdOf(paymentMethod.customer),
    card: {
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
    },
  });
}

export async function readSubscriptionPaymentMethodView(
  organizationId: string,
): Promise<SubscriptionPaymentMethodView> {
  const target = await canonicalBillingTarget(organizationId);
  if (!target.subscriptionId) return { state: "no_subscription" };
  if (!target.customerId) return { state: "unavailable" };
  try {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(target.subscriptionId);
    if (!isLiveStripeSubscriptionObject(subscription)) {
      return { state: "unavailable" };
    }
    if (customerIdOf(subscription.customer) !== target.customerId) {
      return { state: "unavailable" };
    }
    const customer = await stripe.customers.retrieve(target.customerId);
    const customerDefault =
      customer.deleted
        ? null
        : paymentMethodIdOf(customer.invoice_settings?.default_payment_method ?? null);
    const paymentMethodId = effectiveSubscriptionPaymentMethodId({
      subscriptionDefaultPaymentMethodId: paymentMethodIdOf(
        subscription.default_payment_method,
      ),
      customerInvoiceDefaultPaymentMethodId: customerDefault,
    });
    if (!paymentMethodId) return { state: "missing" };
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return { state: "ready", display: snapshotCard(paymentMethod) };
  } catch (error) {
    logStripeBillingError("subscription_payment_method_read", error);
    return { state: "unavailable" };
  }
}

export async function createSubscriptionPaymentMethodSetup(input: {
  organizationId: string;
}): Promise<{ clientSecret: string; returnPath: string }> {
  const target = await canonicalBillingTarget(input.organizationId);
  if (!target.subscriptionId || !target.customerId) {
    throw new BillingConfigurationError(
      "A paid subscription is required before replacing its payment method.",
    );
  }
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(target.subscriptionId);
  if (
    !isLiveStripeSubscriptionObject(subscription) ||
    customerIdOf(subscription.customer) !== target.customerId
  ) {
    throw new BillingConfigurationError(
      "The subscription payment method could not be verified.",
    );
  }
  const current = paymentMethodIdOf(subscription.default_payment_method);
  const setupIntent = await stripe.setupIntents.create(
    subscriptionPaymentMethodSetupParams({
      customerId: target.customerId,
      organizationId: input.organizationId,
      subscriptionId: target.subscriptionId,
    }),
    {
      idempotencyKey: subscriptionPaymentMethodSetupIdempotencyKey(
        input.organizationId,
        current,
      ),
    },
  );
  if (!setupIntent.client_secret) {
    throw new BillingConfigurationError("Stripe did not return a SetupIntent client secret.");
  }
  return { clientSecret: setupIntent.client_secret, returnPath: "/settings/billing?subscription_pm=1" };
}

export async function finalizeSubscriptionPaymentMethodSetup(input: {
  organizationId: string;
  actorUserId: string;
  setupIntentId: string;
}): Promise<{ display: SafeCardDisplay | null }> {
  const target = await canonicalBillingTarget(input.organizationId);
  if (!target.subscriptionId || !target.customerId) {
    throw new BillingConfigurationError(
      "A paid subscription is required before replacing its payment method.",
    );
  }
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(input.setupIntentId);
  const paymentMethodId = paymentMethodIdOf(setupIntent.payment_method);
  const paymentMethod = paymentMethodId
    ? await stripe.paymentMethods.retrieve(paymentMethodId)
    : null;
  const setupSnapshot: SetupIntentVerificationSnapshot = {
    id: setupIntent.id,
    status: setupIntent.status,
    usage: setupIntent.usage,
    customerId: customerIdOf(setupIntent.customer),
    paymentMethodId,
    purpose: setupIntent.metadata?.sanctuary_purpose ?? null,
    organizationId: setupIntent.metadata?.organization_id ?? null,
  };
  const verified = verifySubscriptionPaymentMethodSetup({
    organizationId: input.organizationId,
    customerId: target.customerId,
    subscriptionId: target.subscriptionId,
    setupIntent: setupSnapshot,
    setupSubscriptionId: setupIntent.metadata?.subscription_id ?? null,
    paymentMethod: paymentMethod
      ? {
          id: paymentMethod.id,
          type: paymentMethod.type,
          customerId: customerIdOf(paymentMethod.customer),
          card: paymentMethod.card
            ? {
                brand: paymentMethod.card.brand,
                last4: paymentMethod.card.last4,
                expMonth: paymentMethod.card.exp_month,
                expYear: paymentMethod.card.exp_year,
              }
            : null,
        }
      : null,
  });
  if (!verified.ok) {
    throw new BillingConfigurationError("The payment method could not be verified.");
  }
  const before = await stripe.subscriptions.retrieve(target.subscriptionId);
  if (
    !isLiveStripeSubscriptionObject(before) ||
    customerIdOf(before.customer) !== target.customerId
  ) {
    throw new BillingConfigurationError("The subscription payment method could not be verified.");
  }
  const automaticTaxEnabled = before.automatic_tax?.enabled === true;
  const updated = await stripe.subscriptions.update(
    target.subscriptionId,
    subscriptionDefaultPaymentMethodUpdate(verified.paymentMethodId),
  );
  if (automaticTaxEnabled && updated.automatic_tax?.enabled !== true) {
    logStripeBillingError("subscription_payment_method_tax_changed", new Error("automatic_tax_disabled"));
    throw new BillingConfigurationError(
      "The payment method was not saved because subscription tax settings changed.",
    );
  }
  const admin = createAdminClient();
  await writeAuditLog(admin, {
    organizationId: input.organizationId,
    userId: input.actorUserId,
    action: AuditAction.BILLING_SUBSCRIPTION_PAYMENT_METHOD_UPDATED,
    entityType: "organization",
    entityId: input.organizationId,
    metadata: {
      organization_id: input.organizationId,
      payment_method_id: verified.paymentMethodId,
      brand: verified.display?.brand ?? null,
      last4: verified.display?.last4 ?? null,
    },
  });
  return { display: verified.display };
}

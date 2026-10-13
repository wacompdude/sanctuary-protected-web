/**
 * Server Stripe calls for SMS payment-method setup.
 * Creates and retrieves SetupIntents only. Does not create a PaymentIntent.
 */

import "server-only";

import type Stripe from "stripe";
import { BillingConfigurationError } from "@/lib/billing/errors";
import { ensureStripeCustomerForOrganization } from "@/lib/billing/stripe/customers";
import { createAdminBillingCustomerStore } from "@/lib/billing/stripe/customers";
import { getStripeClient } from "@/lib/billing/stripe/client";
import {
  safeCardDisplay,
  smsPaymentSetupCreateParams,
  smsPaymentSetupIdempotencyKey,
  verifySmsPaymentSetup,
  type PaymentMethodVerificationSnapshot,
  type SafeCardDisplay,
  type SetupIntentVerificationSnapshot,
  type VerifiedSmsPaymentSetup,
  type RejectedSmsPaymentSetup,
} from "@/lib/billing/stripe/sms-payment-setup";

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id;
}

function paymentMethodIdOf(
  paymentMethod: string | Stripe.PaymentMethod | null,
): string | null {
  if (!paymentMethod) return null;
  if (typeof paymentMethod === "string") return paymentMethod;
  return paymentMethod.id;
}

function snapshotSetupIntent(
  setupIntent: Stripe.SetupIntent,
): SetupIntentVerificationSnapshot {
  return {
    id: setupIntent.id,
    status: setupIntent.status,
    usage: setupIntent.usage,
    customerId: customerIdOf(setupIntent.customer),
    paymentMethodId: paymentMethodIdOf(setupIntent.payment_method),
    purpose: setupIntent.metadata?.sanctuary_purpose ?? null,
    organizationId: setupIntent.metadata?.organization_id ?? null,
  };
}

function snapshotPaymentMethod(
  paymentMethod: Stripe.PaymentMethod,
): PaymentMethodVerificationSnapshot {
  return {
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
  };
}

export async function resolveCanonicalStripeCustomer(
  organizationId: string,
): Promise<string> {
  const stripe = getStripeClient();
  const ensured = await ensureStripeCustomerForOrganization({
    organizationId,
    store: createAdminBillingCustomerStore(),
    stripeCustomers: {
      async createCustomer(input) {
        const customer = await stripe.customers.create(
          {
            email: input.email || undefined,
            name: input.name || undefined,
            metadata: input.metadata,
          },
          { idempotencyKey: input.idempotencyKey },
        );
        return { id: customer.id };
      },
    },
  });
  return ensured.providerCustomerId;
}

export async function createSmsAutoReplenishmentSetupIntent(input: {
  organizationId: string;
  customerId: string;
  currentPaymentMethodId: string | null;
}): Promise<{ setupIntentId: string; clientSecret: string; status: string }> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.create(
    smsPaymentSetupCreateParams({
      customerId: input.customerId,
      organizationId: input.organizationId,
    }),
    {
      idempotencyKey: smsPaymentSetupIdempotencyKey(
        input.organizationId,
        input.currentPaymentMethodId,
      ),
    },
  );
  if (!setupIntent.client_secret) {
    throw new BillingConfigurationError("Stripe did not return a SetupIntent client secret.");
  }
  return {
    setupIntentId: setupIntent.id,
    clientSecret: setupIntent.client_secret,
    status: setupIntent.status,
  };
}

export async function verifyCompletedSmsPaymentSetup(input: {
  organizationId: string;
  customerId: string;
  setupIntentId: string;
}): Promise<VerifiedSmsPaymentSetup | RejectedSmsPaymentSetup> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(input.setupIntentId);
  const setupSnapshot = snapshotSetupIntent(setupIntent);
  if (!setupSnapshot.paymentMethodId) {
    return verifySmsPaymentSetup({
      organizationId: input.organizationId,
      customerId: input.customerId,
      setupIntent: setupSnapshot,
      paymentMethod: null,
    });
  }
  const paymentMethod = await stripe.paymentMethods.retrieve(
    setupSnapshot.paymentMethodId,
  );
  return verifySmsPaymentSetup({
    organizationId: input.organizationId,
    customerId: input.customerId,
    setupIntent: setupSnapshot,
    paymentMethod: snapshotPaymentMethod(paymentMethod),
  });
}

export async function readSafeCardDisplay(
  paymentMethodId: string,
): Promise<SafeCardDisplay | null> {
  const stripe = getStripeClient();
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (paymentMethod.type !== "card") return null;
  return safeCardDisplay(snapshotPaymentMethod(paymentMethod));
}

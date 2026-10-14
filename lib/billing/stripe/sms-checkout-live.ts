/**
 * Live Stripe wiring for one-time SMS package Checkout.
 * Self-checks must not import this module.
 */

import { createStripeCatalogPriceLister } from "@/lib/billing/stripe/catalog-stripe";
import { createAdminBillingCustomerStore } from "@/lib/billing/stripe/customers";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import { smsCheckoutAutomaticTaxFields, smsPurchaseTaxCollectionAuthorized } from "@/lib/billing/stripe/sms-purchase-tax";
import {
  createSmsPackageCheckoutSession,
  type CreateSmsPackageCheckoutInput,
} from "@/lib/billing/stripe/sms-checkout";

export async function createLiveSmsPackageCheckoutSession(
  input: CreateSmsPackageCheckoutInput,
) {
  const stripe = getStripeClient(input.stripeSecretKey);
  return createSmsPackageCheckoutSession(input, {
    listPrices: createStripeCatalogPriceLister(input.stripeSecretKey),
    store: createAdminBillingCustomerStore(),
    stripeCustomers: {
      async createCustomer(customerInput) {
        const customer = await stripe.customers.create(
          {
            email: customerInput.email || undefined,
            name: customerInput.name || undefined,
            metadata: customerInput.metadata,
          },
          { idempotencyKey: customerInput.idempotencyKey },
        );
        return { id: customer.id };
      },
    },
    stripeCheckout: {
      async createSmsPackageCheckoutSession(sessionInput) {
        const taxFields = smsCheckoutAutomaticTaxFields(smsPurchaseTaxCollectionAuthorized());
        const session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            customer: sessionInput.customerId,
            line_items: [
              { price: sessionInput.priceId, quantity: sessionInput.quantity },
            ],
            allowed_payment_method_types: [
              ...sessionInput.allowedPaymentMethodTypes,
            ],
            success_url: sessionInput.successUrl,
            cancel_url: sessionInput.cancelUrl,
            client_reference_id: sessionInput.organizationId,
            metadata: sessionInput.metadata,
            ...(taxFields ?? {}),
          },
          { idempotencyKey: sessionInput.idempotencyKey },
        );
        return { id: session.id, url: session.url };
      },
    },
  });
}

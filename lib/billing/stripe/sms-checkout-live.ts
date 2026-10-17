/**
 * Live Stripe wiring for one-time SMS package Checkout.
 * Self-checks must not import this module.
 */

import { BillingCheckoutPlanError } from "@/lib/billing/errors";
import {
  readOrganizationBillingAddress,
  stripeCustomerAddressUpdate,
} from "@/lib/billing/organization-billing-address";
import { createStripeCatalogPriceLister } from "@/lib/billing/stripe/catalog-stripe";
import { createAdminBillingCustomerStore } from "@/lib/billing/stripe/customers";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import { getStripeClient } from "@/lib/billing/stripe/sdk";
import {
  SMS_PURCHASE_TAX_ADDRESS_REQUIRED,
  SMS_PURCHASE_TAX_SYNC_FAILED,
  smsCheckoutAutomaticTaxFields,
  smsPurchaseTaxCollectionAuthorized,
} from "@/lib/billing/stripe/sms-purchase-tax";
import {
  createSmsPackageCheckoutSession,
  type CreateSmsPackageCheckoutInput,
} from "@/lib/billing/stripe/sms-checkout";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createLiveSmsPackageCheckoutSession(
  input: CreateSmsPackageCheckoutInput,
) {
  const stripe = getStripeClient(input.stripeSecretKey);
  const smsTaxAuthorized = smsPurchaseTaxCollectionAuthorized();
  let canonicalAddress: ReturnType<typeof readOrganizationBillingAddress> = null;
  if (smsTaxAuthorized) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organization_billing_profiles")
      .select("billing_address")
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (error) {
      throw new BillingCheckoutPlanError(SMS_PURCHASE_TAX_ADDRESS_REQUIRED);
    }
    canonicalAddress = readOrganizationBillingAddress(data?.billing_address);
  }
  return createSmsPackageCheckoutSession({
    ...input,
    smsTaxAuthorized,
    billingAddressComplete: canonicalAddress !== null,
  }, {
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
    syncCustomerAddress: async (customerId) => {
      if (!canonicalAddress) {
        throw new BillingCheckoutPlanError(SMS_PURCHASE_TAX_ADDRESS_REQUIRED);
      }
      try {
        await stripe.customers.update(
          customerId,
          stripeCustomerAddressUpdate(canonicalAddress),
        );
      } catch (stripeError) {
        logStripeBillingError("billing_address_customer_sync", stripeError);
        throw new BillingCheckoutPlanError(SMS_PURCHASE_TAX_SYNC_FAILED);
      }
    },
    stripeCheckout: {
      async createSmsPackageCheckoutSession(sessionInput) {
        const taxFields = smsCheckoutAutomaticTaxFields(sessionInput.automaticTax);
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

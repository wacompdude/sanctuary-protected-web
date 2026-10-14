/**
 * Persist the organization billing address, then sync the canonical Stripe Customer.
 * Does not calculate tax or create a payment.
 */

import "server-only";

import { AuditAction } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";
import {
  organizationBillingAddressRecord,
  synchronizeOrganizationBillingAddress,
  type OrganizationBillingAddress,
} from "@/lib/billing/organization-billing-address";
import { ensureStripeCustomerForOrganization, createAdminBillingCustomerStore } from "@/lib/billing/stripe/customers";
import { getStripeClient } from "@/lib/billing/stripe/client";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import { createAdminClient } from "@/lib/supabase/admin";

export type BillingAddressSaveResult =
  | { ok: true; sync: "synced" | "needs_attention" }
  | { ok: false; error: string };

export async function persistOrganizationBillingAddress(input: {
  organizationId: string;
  actorUserId: string;
  address: OrganizationBillingAddress;
}): Promise<BillingAddressSaveResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_billing_profiles")
    .update({
      billing_address: organizationBillingAddressRecord(input.address),
    })
    .eq("organization_id", input.organizationId)
    .eq("billing_provider", "stripe")
    .select("organization_id");

  if (error || !data?.length) {
    return { ok: false, error: "The billing address could not be saved." };
  }

  await writeAuditLog(admin, {
    organizationId: input.organizationId,
    userId: input.actorUserId,
    action: AuditAction.BILLING_ADDRESS_UPDATED,
    entityType: "organization_billing_profile",
    entityId: input.organizationId,
    metadata: {
      organization_id: input.organizationId,
      actor_user_id: input.actorUserId,
      action: "billing_address_updated",
      country: input.address.country,
    },
  });

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch (stripeError) {
    logStripeBillingError("billing_address_customer_sync", stripeError);
    return { ok: true, sync: "needs_attention" };
  }
  const store = createAdminBillingCustomerStore();
  const sync = await synchronizeOrganizationBillingAddress({
    organizationId: input.organizationId,
    address: input.address,
    getCustomerId: () => store.getMappedCustomerId(input.organizationId),
    ensureCustomer: () =>
      ensureStripeCustomerForOrganization({
        organizationId: input.organizationId,
        store,
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
      }),
    updateCustomer: async (customerId, fields) => {
      try {
        await stripe.customers.update(customerId, fields);
      } catch (stripeError) {
        logStripeBillingError("billing_address_customer_sync", stripeError);
        throw stripeError;
      }
    },
  });

  return { ok: true, sync };
}

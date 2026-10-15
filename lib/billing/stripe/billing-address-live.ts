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
import {
  orchestrateOrganizationBillingAddressSave,
  type BillingAddressSaveResult,
} from "@/lib/billing/organization-billing-address-save";
import { ensureStripeCustomerForOrganization, createAdminBillingCustomerStore } from "@/lib/billing/stripe/customers";
import { getStripeClient } from "@/lib/billing/stripe/client";
import { logStripeBillingError } from "@/lib/billing/stripe/safe-error-log";
import { createAdminClient } from "@/lib/supabase/admin";

function logBillingAddressSave(
  stage:
    | "profile_ensure_failed"
    | "database_update_failed"
    | "audit_failed"
    | "stripe_sync_failed",
  details: { organizationId: string; actorUserId: string; code?: string | null },
): void {
  console.error(`billing_address_save.${stage}`, {
    organizationId: details.organizationId,
    actorUserId: details.actorUserId,
    code: details.code ?? null,
  });
}

export async function persistOrganizationBillingAddress(input: {
  organizationId: string;
  actorUserId: string;
  address: OrganizationBillingAddress;
}): Promise<BillingAddressSaveResult> {
  const admin = createAdminClient();
  const context = {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  };

  return orchestrateOrganizationBillingAddressSave({
    async ensureProfile() {
      const { data, error } = await admin.rpc("ensure_organization_billing_profile", {
        p_organization_id: input.organizationId,
      });
      if (error || data == null) {
        logBillingAddressSave("profile_ensure_failed", {
          ...context,
          code: error?.code ?? null,
        });
        return { ok: false, code: error?.code ?? null };
      }
      return { ok: true };
    },
    async updateAddress() {
      const { data, error } = await admin
        .from("organization_billing_profiles")
        .update({
          billing_address: organizationBillingAddressRecord(input.address),
        })
        .eq("organization_id", input.organizationId)
        .eq("billing_provider", "stripe")
        .select("organization_id");
      if (error || !data?.length) {
        logBillingAddressSave("database_update_failed", {
          ...context,
          code: error?.code ?? "no_row",
        });
        return { ok: false, code: error?.code ?? "no_row" };
      }
      return { ok: true, rowCount: data.length };
    },
    async audit() {
      const recorded = await writeAuditLog(admin, {
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
      if (!recorded.ok) {
        logBillingAddressSave("audit_failed", context);
      }
      return recorded;
    },
    async syncStripe() {
      let stripe: ReturnType<typeof getStripeClient>;
      try {
        stripe = getStripeClient();
      } catch (stripeError) {
        logStripeBillingError("billing_address_customer_sync", stripeError);
        logBillingAddressSave("stripe_sync_failed", context);
        return "needs_attention";
      }
      try {
        const store = createAdminBillingCustomerStore();
        return await synchronizeOrganizationBillingAddress({
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
      } catch (stripeError) {
        logStripeBillingError("billing_address_customer_sync", stripeError);
        logBillingAddressSave("stripe_sync_failed", context);
        return "needs_attention";
      }
    },
  });
}

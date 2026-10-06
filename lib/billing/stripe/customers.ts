/**
 * Stripe Customer mapping for organizations (Phase 4B-3).
 *
 * Canonical mapping: organization_billing_profiles.provider_customer_id
 * Mirror row: billing_customers (legacy unique org+provider index).
 *
 * Injectable seams keep self-checks free of Stripe/network/DB mutations.
 */

import { BillingConfigurationError } from "@/lib/billing/errors";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

export type OrganizationBillingContact = {
  email: string | null;
  name: string | null;
  organizationName: string | null;
};

export type BillingCustomerMappingStore = {
  getMappedCustomerId(organizationId: string): Promise<string | null>;
  saveMappedCustomerId(input: {
    organizationId: string;
    providerCustomerId: string;
    email?: string | null;
  }): Promise<void>;
  getBillingContact(organizationId: string): Promise<OrganizationBillingContact>;
};

export type StripeCustomerCreateApi = {
  createCustomer(input: {
    email?: string | null;
    name?: string | null;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
};

/** Stable Stripe idempotency key — one Customer per organization. */
export function stripeCustomerIdempotencyKey(organizationId: string): string {
  return `sp_customer_org_${organizationId}`;
}

export function createAdminBillingCustomerStore(): BillingCustomerMappingStore {
  if (!isServiceRoleConfigured()) {
    throw new BillingConfigurationError(
      "SUPABASE_SERVICE_ROLE_KEY is required to map Stripe Customers.",
    );
  }
  const admin = createAdminClient();

  return {
    async getMappedCustomerId(organizationId: string) {
      const { data: profile } = await admin
        .from("organization_billing_profiles")
        .select("provider_customer_id")
        .eq("organization_id", organizationId)
        .eq("billing_provider", "stripe")
        .maybeSingle();

      const fromProfile =
        typeof profile?.provider_customer_id === "string"
          ? profile.provider_customer_id.trim()
          : "";
      if (fromProfile) return fromProfile;

      const { data: legacy } = await admin
        .from("billing_customers")
        .select("provider_customer_id")
        .eq("organization_id", organizationId)
        .eq("billing_provider", "stripe")
        .maybeSingle();

      const fromLegacy =
        typeof legacy?.provider_customer_id === "string"
          ? legacy.provider_customer_id.trim()
          : "";
      return fromLegacy || null;
    },

    async saveMappedCustomerId(input) {
      const email = input.email?.trim() || null;

      const { error: profileError } = await admin
        .from("organization_billing_profiles")
        .upsert(
          {
            organization_id: input.organizationId,
            billing_provider: "stripe",
            provider_customer_id: input.providerCustomerId,
            ...(email ? { billing_email: email } : {}),
          },
          { onConflict: "organization_id" },
        );

      if (profileError) {
        throw new BillingConfigurationError(
          "Unable to persist organization Stripe Customer mapping.",
        );
      }

      const { error: customerError } = await admin.from("billing_customers").upsert(
        {
          organization_id: input.organizationId,
          billing_provider: "stripe",
          provider_customer_id: input.providerCustomerId,
          email,
          metadata: { source: "phase_4b3_checkout" },
        },
        { onConflict: "organization_id,billing_provider" },
      );

      if (customerError) {
        // Profile mapping is canonical; legacy mirror failure is non-fatal if unique race.
        const { data: existing } = await admin
          .from("billing_customers")
          .select("provider_customer_id")
          .eq("organization_id", input.organizationId)
          .eq("billing_provider", "stripe")
          .maybeSingle();
        if (
          !existing ||
          String(existing.provider_customer_id) !== input.providerCustomerId
        ) {
          throw new BillingConfigurationError(
            "Unable to persist billing_customers Stripe Customer mapping.",
          );
        }
      }
    },

    async getBillingContact(organizationId: string) {
      const { data: profile } = await admin
        .from("organization_billing_profiles")
        .select("billing_email, billing_contact_name")
        .eq("organization_id", organizationId)
        .maybeSingle();

      const { data: org } = await admin
        .from("organizations")
        .select("name, primary_email")
        .eq("id", organizationId)
        .maybeSingle();

      const email =
        (typeof profile?.billing_email === "string" &&
          profile.billing_email.trim()) ||
        (typeof org?.primary_email === "string" && org.primary_email.trim()) ||
        null;
      const name =
        (typeof profile?.billing_contact_name === "string" &&
          profile.billing_contact_name.trim()) ||
        null;
      const organizationName =
        typeof org?.name === "string" && org.name.trim() ? org.name.trim() : null;

      return { email, name, organizationName };
    },
  };
}

/**
 * Find or create the Stripe Customer for an organization.
 * Reuses mapped Customer IDs. Creates at most one Customer per org via
 * Stripe idempotency key + unique DB mapping.
 */
export async function ensureStripeCustomerForOrganization(input: {
  organizationId: string;
  fallbackEmail?: string | null;
  store: BillingCustomerMappingStore;
  stripeCustomers: StripeCustomerCreateApi;
}): Promise<{ providerCustomerId: string; created: boolean }> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new BillingConfigurationError("organizationId is required.");
  }

  const existing = await input.store.getMappedCustomerId(organizationId);
  if (existing) {
    return { providerCustomerId: existing, created: false };
  }

  const contact = await input.store.getBillingContact(organizationId);
  const email = contact.email || input.fallbackEmail?.trim() || null;
  const name = contact.name || contact.organizationName || null;

  const created = await input.stripeCustomers.createCustomer({
    email,
    name,
    metadata: {
      organization_id: organizationId,
      sanctuary_protected: "true",
    },
    idempotencyKey: stripeCustomerIdempotencyKey(organizationId),
  });

  // Re-check before save to reduce duplicate mapping races.
  const raced = await input.store.getMappedCustomerId(organizationId);
  if (raced) {
    return { providerCustomerId: raced, created: false };
  }

  await input.store.saveMappedCustomerId({
    organizationId,
    providerCustomerId: created.id,
    email,
  });

  return { providerCustomerId: created.id, created: true };
}

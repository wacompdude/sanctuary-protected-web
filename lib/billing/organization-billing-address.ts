/**
 * Canonical organization billing/tax address.
 * Structural completeness only. This does not calculate or collect tax.
 */

export const ORGANIZATION_BILLING_ADDRESS_COUNTRY = "US";

export const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const US_STATES = new Set<string>(US_STATE_CODES);
const US_POSTAL = /^\d{5}(?:-\d{4})?$/;

export type OrganizationBillingAddress = {
  businessName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
};

export type OrganizationBillingAddressField =
  | "businessName"
  | "line1"
  | "line2"
  | "city"
  | "state"
  | "postalCode"
  | "country";

export type OrganizationBillingAddressInput = {
  businessName?: unknown;
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeBillingCountry(value: unknown): string {
  const country = text(value).toUpperCase();
  if (country === "USA" || country === "UNITED STATES" || country === "UNITED STATES OF AMERICA") {
    return "US";
  }
  return country;
}

export function validateOrganizationBillingAddress(
  input: OrganizationBillingAddressInput,
):
  | { ok: true; address: OrganizationBillingAddress }
  | { ok: false; fieldErrors: Partial<Record<OrganizationBillingAddressField, string>> } {
  const fieldErrors: Partial<Record<OrganizationBillingAddressField, string>> = {};
  const businessName = text(input.businessName);
  const line1 = text(input.line1);
  const line2 = text(input.line2);
  const city = text(input.city);
  const state = text(input.state).toUpperCase();
  const postalCode = text(input.postalCode);
  const country = normalizeBillingCountry(input.country);

  if (!businessName || businessName.length > 200) {
    fieldErrors.businessName = "Enter the billing business name.";
  }
  if (!line1 || line1.length > 200) fieldErrors.line1 = "Enter address line 1.";
  if (line2.length > 200) fieldErrors.line2 = "Address line 2 is too long.";
  if (!city || city.length > 100) fieldErrors.city = "Enter a city.";
  if (!US_STATES.has(state)) fieldErrors.state = "Select a U.S. state.";
  if (!US_POSTAL.test(postalCode)) fieldErrors.postalCode = "Enter a ZIP code.";
  if (country !== ORGANIZATION_BILLING_ADDRESS_COUNTRY) {
    fieldErrors.country = "United States addresses can be saved in this version.";
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    address: {
      businessName,
      line1,
      line2: line2 || null,
      city,
      state,
      postalCode,
      country: "US",
    },
  };
}

/** The state string the billing form submits. The visible selector must use this same value. */
export function submittedOrganizationBillingState(stateCode: string): string {
  return stateCode;
}

export function isOrganizationBillingAddressComplete(
  address: OrganizationBillingAddress | null | undefined,
): boolean {
  if (!address) return false;
  return validateOrganizationBillingAddress(address).ok === true;
}

export function readOrganizationBillingAddress(value: unknown): OrganizationBillingAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const validated = validateOrganizationBillingAddress({
    businessName: row.business_name ?? row.businessName,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code ?? row.postalCode ?? row.postal,
    country: row.country,
  });
  return validated.ok ? validated.address : null;
}

export function organizationBillingAddressRecord(
  address: OrganizationBillingAddress,
): Record<string, string> {
  return {
    business_name: address.businessName,
    line1: address.line1,
    ...(address.line2 ? { line2: address.line2 } : {}),
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country,
  };
}

export function stripeCustomerAddressUpdate(address: OrganizationBillingAddress): {
  name: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: "US";
  };
} {
  return {
    name: address.businessName,
    address: {
      line1: address.line1,
      line2: address.line2 ?? "",
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      country: "US",
    },
  };
}

export async function synchronizeOrganizationBillingAddress(input: {
  organizationId: string;
  address: OrganizationBillingAddress;
  getCustomerId: () => Promise<string | null>;
  ensureCustomer: () => Promise<{ providerCustomerId: string }>;
  updateCustomer: (
    customerId: string,
    fields: ReturnType<typeof stripeCustomerAddressUpdate>,
  ) => Promise<void>;
}): Promise<"synced" | "needs_attention"> {
  try {
    const existing = await input.getCustomerId();
    const customerId = existing ?? (await input.ensureCustomer()).providerCustomerId;
    if (!customerId.startsWith("cus_")) return "needs_attention";
    await input.updateCustomer(customerId, stripeCustomerAddressUpdate(input.address));
    if (!existing) {
      const mapped = await input.getCustomerId();
      if (mapped && mapped !== customerId) return "needs_attention";
    }
    return "synced";
  } catch {
    return "needs_attention";
  }
}

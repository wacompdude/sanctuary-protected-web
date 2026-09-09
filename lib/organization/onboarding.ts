import type { ActionState } from "@/lib/organization/types";
import {
  isOrganizationSlugConflict,
  slugifyOrganizationName,
} from "@/lib/organization/slug";
import { isValidIanaTimeZone } from "@/lib/datetime/timezones";

export const CHURCH_CREATE_GENERIC_ERROR =
  "We couldn't create the church account. Please try again.";

export type ChurchOnboardingInput = {
  name: string;
  slug: string;
  primary_email: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state: string;
  postal_code: string;
  timezone: string;
  campus_name: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateChurchOnboarding(
  formData: FormData,
): ActionState & { data?: ChurchOnboardingInput } {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get("name") ?? "").trim();
  // Never trust a client-supplied slug. The server always derives it from the name.
  const slug = slugifyOrganizationName(name);
  const primary_email = String(formData.get("primary_email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address_line_1 = String(formData.get("address_line_1") ?? "").trim();
  const address_line_2 = String(formData.get("address_line_2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postal_code = String(formData.get("postal_code") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const campus_name = String(formData.get("campus_name") ?? "").trim();

  if (!name) fieldErrors.name = "Church name is required.";
  else if (name.length > 200) fieldErrors.name = "Church name is too long.";

  if (!primary_email) fieldErrors.primary_email = "Primary email is required.";
  else if (!EMAIL_PATTERN.test(primary_email)) {
    fieldErrors.primary_email = "Enter a valid email address.";
  }

  if (!phone) fieldErrors.phone = "Phone is required.";
  if (!address_line_1) fieldErrors.address_line_1 = "Address is required.";
  if (!city) fieldErrors.city = "City is required.";
  if (!state) fieldErrors.state = "State is required.";
  if (!postal_code) fieldErrors.postal_code = "Postal code is required.";
  if (!timezone) fieldErrors.timezone = "Time zone is required.";
  else if (!isValidIanaTimeZone(timezone)) {
    fieldErrors.timezone = "Select a valid time zone.";
  }
  if (!campus_name) fieldErrors.campus_name = "Primary campus name is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      name,
      slug,
      primary_email,
      phone,
      address_line_1,
      address_line_2: address_line_2 || undefined,
      city,
      state,
      postal_code,
      timezone,
      campus_name,
    },
  };
}

/**
 * Map RPC / database errors to a customer-safe action result.
 * Slug collisions should be retried by the caller before this mapping.
 */
export function mapChurchCreateRpcError(message: string): ActionState {
  if (message.includes("UNAUTHENTICATED")) {
    return { error: "You must be signed in to create a church." };
  }

  if (message.includes("VALIDATION:")) {
    const text = message.replace(/^.*VALIDATION:\s*/i, "");
    if (/slug|url name/i.test(text) || isOrganizationSlugConflict(text)) {
      return { error: CHURCH_CREATE_GENERIC_ERROR };
    }
    if (/church name is required/i.test(text)) {
      return { fieldErrors: { name: "Church name is required." } };
    }
    if (/primary campus name is required/i.test(text)) {
      return { fieldErrors: { campus_name: "Primary campus name is required." } };
    }
    if (/primary email is required/i.test(text)) {
      return { fieldErrors: { primary_email: "Primary email is required." } };
    }
    if (/primary email is invalid/i.test(text)) {
      return { fieldErrors: { primary_email: "Enter a valid email address." } };
    }
    return { error: text };
  }

  if (isOrganizationSlugConflict(message)) {
    return { error: CHURCH_CREATE_GENERIC_ERROR };
  }

  return { error: CHURCH_CREATE_GENERIC_ERROR };
}

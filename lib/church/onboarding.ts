import type { ActionState } from "@/lib/church/types";

export type ChurchOnboardingInput = {
  name: string;
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
  if (!campus_name) fieldErrors.campus_name = "Primary campus name is required.";

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      name,
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

/** Common US-focused time zones for the onboarding select. */
export const ONBOARDING_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
] as const;

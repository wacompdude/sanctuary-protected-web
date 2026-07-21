import {
  CAMPUS_STATUSES,
  CAMPUS_TYPES,
  slugifyCampusName,
} from "@/lib/campuses/constants";
import type {
  CampusActionState,
  CampusFormInput,
  CampusStatus,
  CampusType,
} from "@/lib/campuses/types";

function text(formData: FormData, key: string, max: number): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

function checkbox(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

const EMAIL =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCampusForm(
  formData: FormData,
  options?: { allowExtendedStatuses?: boolean },
): CampusActionState & { data?: CampusFormInput } {
  const fieldErrors: Record<string, string> = {};
  const allowExtended = options?.allowExtendedStatuses !== false;

  const name = text(formData, "name", 200);
  if (!name) fieldErrors.name = "Campus name is required.";

  const short_name = text(formData, "short_name", 64);
  let slug = text(formData, "slug", 80);
  if (slug) {
    slug = slug.toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      fieldErrors.slug =
        "Use lowercase letters, numbers, and hyphens only.";
    }
  } else if (name) {
    slug = slugifyCampusName(name);
  }

  const description = text(formData, "description", 4000);

  const typeRaw = text(formData, "campus_type", 32) ?? "other";
  if (!CAMPUS_TYPES.some((item) => item.value === typeRaw)) {
    fieldErrors.campus_type = "Select a valid campus type.";
  }

  const statusRaw = text(formData, "status", 32) ?? "active";
  const allowedStatuses = allowExtended
    ? CAMPUS_STATUSES
    : CAMPUS_STATUSES.filter(
        (item) => item.value === "active" || item.value === "inactive",
      );
  if (!allowedStatuses.some((item) => item.value === statusRaw)) {
    fieldErrors.status = "Select a valid status.";
  }

  const primary_email = text(formData, "primary_email", 320);
  if (primary_email && !EMAIL.test(primary_email)) {
    fieldErrors.primary_email = "Enter a valid email.";
  }

  const phone = text(formData, "phone", 40);
  const address_line_1 = text(formData, "address_line_1", 200);
  const address_line_2 = text(formData, "address_line_2", 200);
  const city = text(formData, "city", 100);
  const state = text(formData, "state", 50);
  const postal_code = text(formData, "postal_code", 20);
  const country = text(formData, "country", 80) ?? "US";
  const timezone = text(formData, "timezone", 64);

  const emergency_contact_name = text(formData, "emergency_contact_name", 200);
  const emergency_contact_phone = text(formData, "emergency_contact_phone", 40);
  const police_non_emergency_phone = text(
    formData,
    "police_non_emergency_phone",
    40,
  );
  const fire_non_emergency_phone = text(
    formData,
    "fire_non_emergency_phone",
    40,
  );
  const nearest_hospital_name = text(formData, "nearest_hospital_name", 200);
  const nearest_hospital_phone = text(formData, "nearest_hospital_phone", 40);
  const nearest_hospital_address = text(
    formData,
    "nearest_hospital_address",
    400,
  );

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  return {
    data: {
      name: name!,
      short_name,
      slug,
      description,
      campus_type: typeRaw as CampusType,
      status: statusRaw as CampusStatus,
      is_primary: checkbox(formData, "is_primary"),
      primary_email,
      phone,
      address_line_1,
      address_line_2,
      city,
      state,
      postal_code,
      country,
      timezone,
      emergency_contact_name,
      emergency_contact_phone,
      police_non_emergency_phone,
      fire_non_emergency_phone,
      nearest_hospital_name,
      nearest_hospital_phone,
      nearest_hospital_address,
    },
  };
}

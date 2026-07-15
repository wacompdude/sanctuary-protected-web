import type { ActionState } from "@/lib/church/types";

export const CHURCH_CONTACT_TYPES = [
  "head_pastor",
  "elder_board",
  "facility_maintenance_lead",
  "it_cybersecurity_lead",
  "head_of_security",
  "police_non_emergency",
  "alarm_company",
  "insurance_company",
  "facility_vendors",
  "hardware_vendors",
  "av_technician",
] as const;

export type ChurchContactType = (typeof CHURCH_CONTACT_TYPES)[number];

export const CHURCH_CONTACT_GROUPS = [
  {
    id: "organization",
    href: "/settings/church/contact/organization",
    label: "Organization",
    description:
      "Primary church email, phone, website, emergency contacts, and address.",
    contactTypes: [] as ChurchContactType[],
  },
  {
    id: "leadership",
    href: "/settings/church/contact/leadership",
    label: "Leadership",
    description: "Pastoral, elder board, facilities, and IT leadership contacts.",
    contactTypes: [
      "head_pastor",
      "elder_board",
      "facility_maintenance_lead",
      "it_cybersecurity_lead",
    ] as ChurchContactType[],
  },
  {
    id: "security-emergency",
    href: "/settings/church/contact/security-emergency",
    label: "Security & Emergency",
    description:
      "Security leadership and partner emergency-response contacts.",
    contactTypes: [
      "head_of_security",
      "police_non_emergency",
      "alarm_company",
      "insurance_company",
    ] as ChurchContactType[],
  },
  {
    id: "vendors",
    href: "/settings/church/contact/vendors",
    label: "Vendors & Services",
    description: "Facility, hardware, and AV vendor contacts.",
    contactTypes: [
      "facility_vendors",
      "hardware_vendors",
      "av_technician",
    ] as ChurchContactType[],
  },
] as const;

export type ChurchContactGroupId =
  (typeof CHURCH_CONTACT_GROUPS)[number]["id"];

export type ChurchContactRecord = {
  id: string;
  church_id: string;
  contact_type: ChurchContactType;
  organization_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

export function isMultiContactType(type: ChurchContactType): boolean {
  return type === "facility_vendors" || type === "hardware_vendors";
}

export function labelForContactType(type: ChurchContactType): string {
  switch (type) {
    case "head_pastor":
      return "Head Pastor";
    case "elder_board":
      return "Elder Board";
    case "facility_maintenance_lead":
      return "Facility and Maintenance Lead";
    case "it_cybersecurity_lead":
      return "IT / Cybersecurity Lead";
    case "head_of_security":
      return "Head of Security";
    case "police_non_emergency":
      return "Police – Non Emergency";
    case "alarm_company":
      return "Alarm Company";
    case "insurance_company":
      return "Insurance Company";
    case "facility_vendors":
      return "Facility Vendors";
    case "hardware_vendors":
      return "Hardware Vendors (HVAC, Locksmith, etc.)";
    case "av_technician":
      return "AV Technician";
    default:
      return type;
  }
}

export function contactGroupForType(
  type: ChurchContactType,
): (typeof CHURCH_CONTACT_GROUPS)[number] | undefined {
  return CHURCH_CONTACT_GROUPS.find((group) =>
    (group.contactTypes as readonly string[]).includes(type),
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MAX = 40;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

export function isChurchContactType(value: string): value is ChurchContactType {
  return (CHURCH_CONTACT_TYPES as readonly string[]).includes(value);
}

export function validateChurchContactForm(formData: FormData): ActionState & {
  data?: {
    contactType: ChurchContactType;
    organization_name: string | null;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
  };
} {
  const fieldErrors: Record<string, string> = {};
  const contactTypeRaw = readString(formData, "contact_type").trim();
  const organization_name = emptyToNull(
    readString(formData, "organization_name"),
  );
  const full_name = emptyToNull(readString(formData, "full_name"));
  const phone = emptyToNull(readString(formData, "phone"));
  const email = emptyToNull(readString(formData, "email"));
  const notes = emptyToNull(readString(formData, "notes"));

  if (!isChurchContactType(contactTypeRaw)) {
    return { error: "Unknown contact type." };
  }

  if (phone && phone.length > PHONE_MAX) {
    fieldErrors.phone = "Phone number is too long.";
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (notes && notes.length > 2000) {
    fieldErrors.notes = "Notes must be 2000 characters or fewer.";
  }
  if (!organization_name && !full_name && !phone && !email) {
    fieldErrors.full_name =
      "Enter at least a name, organization, phone, or email.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      contactType: contactTypeRaw,
      organization_name,
      full_name,
      phone,
      email,
      notes,
    },
  };
}

export function migrationHintFromContactsError(message: string): string | null {
  if (
    /church_contacts|church_contact_type/i.test(message) &&
    /does not exist/i.test(message)
  ) {
    return "Church contacts are not configured yet. Run supabase/migrations/019_church_contacts.sql in the Supabase SQL Editor.";
  }
  return null;
}

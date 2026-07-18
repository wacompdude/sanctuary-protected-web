import type { ActionState, ChurchStatus, MembershipRole } from "@/lib/church/types";
import { isOwnershipRole } from "@/lib/church/types";
import { ONBOARDING_TIMEZONES } from "@/lib/church/onboarding";

export const CHURCH_SETTINGS_VIEW_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
  "security_leader",
];

export const CHURCH_SETTINGS_EDIT_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
];

export function canViewChurchSettings(role: MembershipRole): boolean {
  return CHURCH_SETTINGS_VIEW_ROLES.includes(role);
}

export function canManageChurchSettings(role: MembershipRole): boolean {
  return CHURCH_SETTINGS_EDIT_ROLES.includes(role);
}

export function canManageChurchAccountStatus(role: MembershipRole): boolean {
  return isOwnershipRole(role);
}

export const SETTINGS_TIMEZONES = ONBOARDING_TIMEZONES;

export const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
] as const;

export const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
] as const;

export const DASHBOARD_LANDING_OPTIONS = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/incidents", label: "Incidents" },
  { value: "/team", label: "Team" },
  { value: "/certifications", label: "Certifications" },
] as const;

export const INCIDENT_SORT_OPTIONS = [
  { value: "occurred_at_desc", label: "Newest first" },
  { value: "occurred_at_asc", label: "Oldest first" },
  { value: "severity_desc", label: "Severity (high first)" },
  { value: "status", label: "Status" },
] as const;

export type ChurchAppPreferences = {
  date_format: (typeof DATE_FORMAT_OPTIONS)[number]["value"];
  time_format: (typeof TIME_FORMAT_OPTIONS)[number]["value"];
  default_dashboard_page: (typeof DASHBOARD_LANDING_OPTIONS)[number]["value"];
  default_incident_sort: (typeof INCIDENT_SORT_OPTIONS)[number]["value"];
  enable_email_notifications: boolean;
  enable_push_notifications: boolean;
  enable_sms_notifications: boolean;
  enable_iot_sensors: boolean;
  enable_camera_integration: boolean;
};

export const DEFAULT_APP_PREFERENCES: ChurchAppPreferences = {
  date_format: "MM/DD/YYYY",
  time_format: "12h",
  default_dashboard_page: "/dashboard",
  default_incident_sort: "occurred_at_desc",
  enable_email_notifications: true,
  enable_push_notifications: false,
  enable_sms_notifications: false,
  enable_iot_sensors: false,
  enable_camera_integration: false,
};

export type ChurchSettingsRecord = {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  denomination: string | null;
  year_established: number | null;
  description: string | null;
  primary_language: string | null;
  primary_email: string | null;
  phone: string | null;
  website_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  secondary_emergency_contact_name: string | null;
  secondary_emergency_contact_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;
  logo_path: string | null;
  primary_brand_color: string | null;
  secondary_brand_color: string | null;
  default_emergency_phone: string | null;
  police_non_emergency_phone: string | null;
  fire_non_emergency_phone: string | null;
  nearest_hospital_name: string | null;
  nearest_hospital_phone: string | null;
  nearest_hospital_address: string | null;
  default_emergency_notification_sender: string | null;
  incident_retention_days: number | null;
  certification_warning_days: number | null;
  require_incident_location: boolean | null;
  require_incident_severity: boolean | null;
  require_incident_follow_up: boolean | null;
  allow_security_members_create_incidents: boolean | null;
  allow_security_members_close_incidents: boolean | null;
  settings: ChurchAppPreferences | Record<string, unknown> | null;
  status: ChurchStatus;
  plan_name: string | null;
  trial_ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const CHURCH_SETTINGS_SELECT = [
  "id",
  "name",
  "display_name",
  "slug",
  "denomination",
  "year_established",
  "description",
  "primary_language",
  "primary_email",
  "phone",
  "website_url",
  "emergency_contact_name",
  "emergency_contact_phone",
  "secondary_emergency_contact_name",
  "secondary_emergency_contact_phone",
  "address_line_1",
  "address_line_2",
  "city",
  "state",
  "postal_code",
  "country",
  "timezone",
  "logo_path",
  "primary_brand_color",
  "secondary_brand_color",
  "default_emergency_phone",
  "police_non_emergency_phone",
  "fire_non_emergency_phone",
  "nearest_hospital_name",
  "nearest_hospital_phone",
  "nearest_hospital_address",
  "default_emergency_notification_sender",
  "incident_retention_days",
  "certification_warning_days",
  "require_incident_location",
  "require_incident_severity",
  "require_incident_follow_up",
  "allow_security_members_create_incidents",
  "allow_security_members_close_incidents",
  "settings",
  "status",
  "plan_name",
  "trial_ends_at",
  "created_at",
  "updated_at",
].join(", ");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/.+/i;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PHONE_MAX = 40;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function readOptionalPhone(
  formData: FormData,
  key: string,
  fieldErrors: Record<string, string>,
): string | null {
  const value = emptyToNull(readString(formData, key));
  if (value && value.length > PHONE_MAX) {
    fieldErrors[key] = "Phone number is too long.";
  }
  return value;
}

function readCheckbox(formData: FormData, key: string): boolean {
  const raw = formData.get(key);
  return raw === "true" || raw === "on" || raw === "1";
}

function includeOption<T extends string>(
  value: string,
  options: readonly { value: T }[],
): value is T {
  return options.some((option) => option.value === value);
}

export function parseAppPreferences(
  raw: unknown,
): ChurchAppPreferences {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const date_format = includeOption(
    String(source.date_format ?? ""),
    DATE_FORMAT_OPTIONS,
  )
    ? (source.date_format as ChurchAppPreferences["date_format"])
    : DEFAULT_APP_PREFERENCES.date_format;

  const time_format = includeOption(
    String(source.time_format ?? ""),
    TIME_FORMAT_OPTIONS,
  )
    ? (source.time_format as ChurchAppPreferences["time_format"])
    : DEFAULT_APP_PREFERENCES.time_format;

  const default_dashboard_page = includeOption(
    String(source.default_dashboard_page ?? ""),
    DASHBOARD_LANDING_OPTIONS,
  )
    ? (source.default_dashboard_page as ChurchAppPreferences["default_dashboard_page"])
    : DEFAULT_APP_PREFERENCES.default_dashboard_page;

  const default_incident_sort = includeOption(
    String(source.default_incident_sort ?? ""),
    INCIDENT_SORT_OPTIONS,
  )
    ? (source.default_incident_sort as ChurchAppPreferences["default_incident_sort"])
    : DEFAULT_APP_PREFERENCES.default_incident_sort;

  return {
    date_format,
    time_format,
    default_dashboard_page,
    default_incident_sort,
    enable_email_notifications:
      typeof source.enable_email_notifications === "boolean"
        ? source.enable_email_notifications
        : DEFAULT_APP_PREFERENCES.enable_email_notifications,
    enable_push_notifications:
      typeof source.enable_push_notifications === "boolean"
        ? source.enable_push_notifications
        : DEFAULT_APP_PREFERENCES.enable_push_notifications,
    enable_sms_notifications:
      typeof source.enable_sms_notifications === "boolean"
        ? source.enable_sms_notifications
        : DEFAULT_APP_PREFERENCES.enable_sms_notifications,
    enable_iot_sensors:
      typeof source.enable_iot_sensors === "boolean"
        ? source.enable_iot_sensors
        : DEFAULT_APP_PREFERENCES.enable_iot_sensors,
    enable_camera_integration:
      typeof source.enable_camera_integration === "boolean"
        ? source.enable_camera_integration
        : DEFAULT_APP_PREFERENCES.enable_camera_integration,
  };
}

export function normalizeChurchSettings(
  row: ChurchSettingsRecord,
): ChurchSettingsRecord & { preferences: ChurchAppPreferences } {
  return {
    ...row,
    timezone: row.timezone || "America/Los_Angeles",
    preferences: parseAppPreferences(row.settings),
  };
}

type ValidationResult<T> = ActionState & { data?: T };

export function validateGeneralSettings(
  formData: FormData,
): ValidationResult<{
  name: string;
  display_name: string | null;
  slug: string;
  denomination: string | null;
  year_established: number | null;
  description: string | null;
  primary_language: string | null;
}> {
  const fieldErrors: Record<string, string> = {};
  const name = readString(formData, "name").trim();
  const display_name = emptyToNull(readString(formData, "display_name"));
  const slug = readString(formData, "slug").trim().toLowerCase();
  const denomination = emptyToNull(readString(formData, "denomination"));
  const description = emptyToNull(readString(formData, "description"));
  const primary_language =
    emptyToNull(readString(formData, "primary_language")) ?? "en";
  const yearRaw = readString(formData, "year_established").trim();

  if (!name) fieldErrors.name = "Church name is required.";
  else if (name.length > 200) fieldErrors.name = "Church name is too long.";

  if (!slug) fieldErrors.slug = "Slug is required.";
  else if (!SLUG_PATTERN.test(slug)) {
    fieldErrors.slug =
      "Use lowercase letters, numbers, and hyphens only (e.g. grace-community).";
  } else if (slug.length > 80) {
    fieldErrors.slug = "Slug is too long.";
  }

  if (description && description.length > 4000) {
    fieldErrors.description = "Description must be 4000 characters or fewer.";
  }

  let year_established: number | null = null;
  if (yearRaw) {
    const year = Number(yearRaw);
    const maxYear = new Date().getUTCFullYear() + 1;
    if (!Number.isInteger(year) || year < 1600 || year > maxYear) {
      fieldErrors.year_established = `Enter a year between 1600 and ${maxYear}.`;
    } else {
      year_established = year;
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      name,
      display_name,
      slug,
      denomination,
      year_established,
      description,
      primary_language,
    },
  };
}

export function validateContactSettings(
  formData: FormData,
): ValidationResult<{
  primary_email: string | null;
  phone: string | null;
  website_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  secondary_emergency_contact_name: string | null;
  secondary_emergency_contact_phone: string | null;
}> {
  const fieldErrors: Record<string, string> = {};
  const primary_email = emptyToNull(readString(formData, "primary_email"));
  const phone = readOptionalPhone(formData, "phone", fieldErrors);
  const website_url = emptyToNull(readString(formData, "website_url"));
  const emergency_contact_name = emptyToNull(
    readString(formData, "emergency_contact_name"),
  );
  const emergency_contact_phone = readOptionalPhone(
    formData,
    "emergency_contact_phone",
    fieldErrors,
  );
  const secondary_emergency_contact_name = emptyToNull(
    readString(formData, "secondary_emergency_contact_name"),
  );
  const secondary_emergency_contact_phone = readOptionalPhone(
    formData,
    "secondary_emergency_contact_phone",
    fieldErrors,
  );

  if (primary_email && !EMAIL_PATTERN.test(primary_email)) {
    fieldErrors.primary_email = "Enter a valid email address.";
  }
  if (website_url && !URL_PATTERN.test(website_url)) {
    fieldErrors.website_url = "Enter a valid http:// or https:// URL.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      primary_email,
      phone,
      website_url,
      emergency_contact_name,
      emergency_contact_phone,
      secondary_emergency_contact_name,
      secondary_emergency_contact_phone,
    },
  };
}

export function validateAddressSettings(
  formData: FormData,
): ValidationResult<{
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string;
}> {
  const fieldErrors: Record<string, string> = {};
  const address_line_1 = emptyToNull(readString(formData, "address_line_1"));
  const address_line_2 = emptyToNull(readString(formData, "address_line_2"));
  const city = emptyToNull(readString(formData, "city"));
  const state = emptyToNull(readString(formData, "state"));
  const postal_code = emptyToNull(readString(formData, "postal_code"));
  const country =
    emptyToNull(readString(formData, "country")) ?? "United States";
  const timezone =
    emptyToNull(readString(formData, "timezone")) ?? "America/Los_Angeles";

  if (
    !(SETTINGS_TIMEZONES as readonly string[]).includes(timezone) &&
    timezone !== "America/Los_Angeles"
  ) {
    // Allow saved values outside the curated list if already present, but reject
    // unknown newly submitted ones that are clearly invalid.
    if (!/^[A-Za-z_]+\/[A-Za-z0-9_+\-]+$/.test(timezone)) {
      fieldErrors.timezone = "Select a valid time zone.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      address_line_1,
      address_line_2,
      city,
      state,
      postal_code,
      country,
      timezone,
    },
  };
}

export function validateBrandingSettings(
  formData: FormData,
): ValidationResult<{
  logo_path: string | null;
  primary_brand_color: string | null;
  secondary_brand_color: string | null;
}> {
  const fieldErrors: Record<string, string> = {};
  const logo_path = emptyToNull(readString(formData, "logo_path"));
  const primary_brand_color = emptyToNull(
    readString(formData, "primary_brand_color"),
  );
  const secondary_brand_color = emptyToNull(
    readString(formData, "secondary_brand_color"),
  );

  if (logo_path && logo_path.length > 500) {
    fieldErrors.logo_path = "Logo path or URL is too long.";
  }
  if (logo_path && logo_path.includes("://") && !URL_PATTERN.test(logo_path)) {
    fieldErrors.logo_path = "Logo URL must start with http:// or https://.";
  }
  if (primary_brand_color && !HEX_COLOR_PATTERN.test(primary_brand_color)) {
    fieldErrors.primary_brand_color = "Use a hex color like #1A6B4A.";
  }
  if (secondary_brand_color && !HEX_COLOR_PATTERN.test(secondary_brand_color)) {
    fieldErrors.secondary_brand_color = "Use a hex color like #1A6B4A.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      logo_path,
      primary_brand_color,
      secondary_brand_color,
    },
  };
}

export function validateSecuritySettings(
  formData: FormData,
): ValidationResult<{
  default_emergency_phone: string | null;
  police_non_emergency_phone: string | null;
  fire_non_emergency_phone: string | null;
  nearest_hospital_name: string | null;
  nearest_hospital_phone: string | null;
  nearest_hospital_address: string | null;
  default_emergency_notification_sender: string | null;
  incident_retention_days: number;
  require_incident_location: boolean;
  require_incident_severity: boolean;
  require_incident_follow_up: boolean;
  allow_security_members_create_incidents: boolean;
  allow_security_members_close_incidents: boolean;
}> {
  const fieldErrors: Record<string, string> = {};
  const default_emergency_phone = readOptionalPhone(
    formData,
    "default_emergency_phone",
    fieldErrors,
  );
  const police_non_emergency_phone = readOptionalPhone(
    formData,
    "police_non_emergency_phone",
    fieldErrors,
  );
  const fire_non_emergency_phone = readOptionalPhone(
    formData,
    "fire_non_emergency_phone",
    fieldErrors,
  );
  const nearest_hospital_name = emptyToNull(
    readString(formData, "nearest_hospital_name"),
  );
  const nearest_hospital_phone = readOptionalPhone(
    formData,
    "nearest_hospital_phone",
    fieldErrors,
  );
  const nearest_hospital_address = emptyToNull(
    readString(formData, "nearest_hospital_address"),
  );
  const default_emergency_notification_sender = emptyToNull(
    readString(formData, "default_emergency_notification_sender"),
  );

  const retentionRaw = readString(formData, "incident_retention_days").trim();
  const retention = Number(retentionRaw || "2555");
  if (!Number.isInteger(retention) || retention < 30 || retention > 36500) {
    fieldErrors.incident_retention_days =
      "Retention must be between 30 and 36500 days.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      default_emergency_phone,
      police_non_emergency_phone,
      fire_non_emergency_phone,
      nearest_hospital_name,
      nearest_hospital_phone,
      nearest_hospital_address,
      default_emergency_notification_sender,
      incident_retention_days: retention,
      require_incident_location: readCheckbox(
        formData,
        "require_incident_location",
      ),
      require_incident_severity: readCheckbox(
        formData,
        "require_incident_severity",
      ),
      require_incident_follow_up: readCheckbox(
        formData,
        "require_incident_follow_up",
      ),
      allow_security_members_create_incidents: readCheckbox(
        formData,
        "allow_security_members_create_incidents",
      ),
      allow_security_members_close_incidents: readCheckbox(
        formData,
        "allow_security_members_close_incidents",
      ),
    },
  };
}

export function validatePreferenceSettings(
  formData: FormData,
): ValidationResult<{
  certification_warning_days: number;
  preferences: ChurchAppPreferences;
}> {
  const fieldErrors: Record<string, string> = {};
  const warningRaw = readString(formData, "certification_warning_days").trim();
  const certification_warning_days = Number(warningRaw || "60");
  if (
    !Number.isInteger(certification_warning_days) ||
    certification_warning_days < 1 ||
    certification_warning_days > 365
  ) {
    fieldErrors.certification_warning_days =
      "Warning period must be between 1 and 365 days.";
  }

  const date_format = readString(formData, "date_format").trim();
  const time_format = readString(formData, "time_format").trim();
  const default_dashboard_page = readString(
    formData,
    "default_dashboard_page",
  ).trim();
  const default_incident_sort = readString(
    formData,
    "default_incident_sort",
  ).trim();

  if (!includeOption(date_format, DATE_FORMAT_OPTIONS)) {
    fieldErrors.date_format = "Select a valid date format.";
  }
  if (!includeOption(time_format, TIME_FORMAT_OPTIONS)) {
    fieldErrors.time_format = "Select a valid time format.";
  }
  if (!includeOption(default_dashboard_page, DASHBOARD_LANDING_OPTIONS)) {
    fieldErrors.default_dashboard_page = "Select a valid landing page.";
  }
  if (!includeOption(default_incident_sort, INCIDENT_SORT_OPTIONS)) {
    fieldErrors.default_incident_sort = "Select a valid sort order.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  return {
    data: {
      certification_warning_days,
      preferences: {
        date_format: date_format as ChurchAppPreferences["date_format"],
        time_format: time_format as ChurchAppPreferences["time_format"],
        default_dashboard_page:
          default_dashboard_page as ChurchAppPreferences["default_dashboard_page"],
        default_incident_sort:
          default_incident_sort as ChurchAppPreferences["default_incident_sort"],
        enable_email_notifications: readCheckbox(
          formData,
          "enable_email_notifications",
        ),
        enable_push_notifications: readCheckbox(
          formData,
          "enable_push_notifications",
        ),
        enable_sms_notifications: readCheckbox(
          formData,
          "enable_sms_notifications",
        ),
        enable_iot_sensors: readCheckbox(formData, "enable_iot_sensors"),
        enable_camera_integration: readCheckbox(
          formData,
          "enable_camera_integration",
        ),
      },
    },
  };
}

export function validateAccountStatusAction(
  formData: FormData,
  churchName: string,
  currentStatus: ChurchStatus,
): ValidationResult<{ nextStatus: "suspended" | "active" | "closed" }> {
  const fieldErrors: Record<string, string> = {};
  const action = readString(formData, "account_action").trim();
  const confirmation = readString(formData, "confirm_name").trim();

  if (confirmation !== churchName) {
    fieldErrors.confirm_name = "Type the exact church name to confirm.";
  }

  let nextStatus: "suspended" | "active" | "closed" | null = null;
  if (action === "suspend") {
    if (currentStatus === "suspended" || currentStatus === "closed") {
      return { error: "This church account cannot be suspended in its current state." };
    }
    nextStatus = "suspended";
  } else if (action === "reactivate") {
    if (currentStatus !== "suspended") {
      return { error: "Only a suspended church can be reactivated." };
    }
    nextStatus = "active";
  } else if (action === "close") {
    if (currentStatus === "closed") {
      return { error: "This church account is already closed." };
    }
    nextStatus = "closed";
  } else {
    return { error: "Unknown account action." };
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  if (!nextStatus) return { error: "Unable to determine the next status." };

  return { data: { nextStatus } };
}

export function changedKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return Object.keys(after).filter((key) => {
    const left = before[key];
    const right = after[key];
    return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
  });
}

export function migrationHintFromError(message: string): string | null {
  if (
    /does not exist/i.test(message) &&
    /(column|relation).*churches|display_name|settings|plan_name|trial_ends_at/i.test(
      message,
    )
  ) {
    return "Church settings columns are missing. Run supabase/migrations/017_church_settings.sql and 018_church_logo_storage_and_suspended_recovery.sql in the Supabase SQL Editor.";
  }
  if (/bucket not found|church-branding/i.test(message)) {
    return "Logo storage is not configured yet. Run supabase/migrations/018_church_logo_storage_and_suspended_recovery.sql in the Supabase SQL Editor.";
  }
  return null;
}

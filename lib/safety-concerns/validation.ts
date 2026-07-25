import {
  SAFETY_CONCERN_INCIDENT_RELATIONSHIPS,
  SAFETY_CONCERN_PHOTO_SOURCES,
  SAFETY_CONCERN_PROFILE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
  SAFETY_CONCERN_REVIEW_INTERVALS,
  SAFETY_CONCERN_RISK_CONTEXTS,
  SAFETY_CONCERN_SCOPE_TYPES,
} from "@/lib/safety-concerns/constants";
import type {
  SafetyConcernActionState,
  SafetyConcernChurchSettings,
  SafetyConcernIncidentRelationship,
  SafetyConcernPhotoSource,
  SafetyConcernProfileStatus,
  SafetyConcernRestrictionStatus,
  SafetyConcernRestrictionType,
  SafetyConcernRiskContext,
  SafetyConcernScopeType,
} from "@/lib/safety-concerns/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string, max: number): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

function requiredText(
  formData: FormData,
  key: string,
  max: number,
): string | null {
  return text(formData, key, max);
}

function optionalUuid(formData: FormData, key: string): string | null {
  const value = text(formData, key, 36);
  if (!value) return null;
  return UUID_RE.test(value) ? value : "__invalid__";
}

function optionalDate(formData: FormData, key: string): string | null {
  const value = text(formData, key, 32);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "__invalid__";
  return value;
}

function enumValue<T extends string>(
  formData: FormData,
  key: string,
  options: { value: T }[],
  fallback?: T,
): T | null {
  const raw = text(formData, key, 80);
  if (!raw) return fallback ?? null;
  return options.some((item) => item.value === raw) ? (raw as T) : null;
}

export type SafetyConcernProfileFormData = {
  display_name: string;
  known_aliases: string | null;
  scope_type: SafetyConcernScopeType;
  primary_campus_id: string | null;
  campus_ids: string[];
  profile_status: SafetyConcernProfileStatus;
  risk_context: SafetyConcernRiskContext;
  restriction_type: SafetyConcernRestrictionType;
  restriction_status: SafetyConcernRestrictionStatus;
  restriction_start_date: string | null;
  restriction_end_date: string | null;
  restriction_reference: string | null;
  short_note: string | null;
  response_guidance: string | null;
  general_notes: string | null;
  last_known_context: string | null;
  related_incident_summary: string | null;
  next_review_date: string | null;
  expires_at: string | null;
};

export type SafetyConcernPhotoMetaFormData = {
  photo_context_note: string | null;
  source_type: SafetyConcernPhotoSource;
  source_reference: string | null;
  is_primary: boolean;
  taken_at: string | null;
};

export function validateSafetyConcernProfileForm(
  formData: FormData,
): SafetyConcernActionState & { data?: SafetyConcernProfileFormData } {
  const fieldErrors: Record<string, string> = {};

  const display_name = requiredText(formData, "display_name", 200);
  if (!display_name) {
    fieldErrors.display_name = "Display name or identifier is required.";
  }

  const scope_type = enumValue(
    formData,
    "scope_type",
    SAFETY_CONCERN_SCOPE_TYPES,
    "church_wide",
  );
  if (!scope_type) {
    fieldErrors.scope_type = "Select a valid campus scope.";
  }

  const profile_status = enumValue(
    formData,
    "profile_status",
    SAFETY_CONCERN_PROFILE_STATUSES,
    "draft",
  );
  if (!profile_status) {
    fieldErrors.profile_status = "Select a valid status.";
  }

  const risk_context = enumValue(
    formData,
    "risk_context",
    SAFETY_CONCERN_RISK_CONTEXTS,
    "other_documented_concern",
  );
  if (!risk_context) {
    fieldErrors.risk_context = "Select a documented basis category.";
  }

  const restriction_type = enumValue(
    formData,
    "restriction_type",
    SAFETY_CONCERN_RESTRICTION_TYPES,
    "none",
  );
  if (!restriction_type) {
    fieldErrors.restriction_type = "Select a valid restriction type.";
  }

  const restriction_status = enumValue(
    formData,
    "restriction_status",
    SAFETY_CONCERN_RESTRICTION_STATUSES,
    "not_applicable",
  );
  if (!restriction_status) {
    fieldErrors.restriction_status = "Select a valid restriction status.";
  }

  const primary_campus_id = optionalUuid(formData, "primary_campus_id");
  if (primary_campus_id === "__invalid__") {
    fieldErrors.primary_campus_id = "Campus is invalid.";
  }

  const campus_ids = formData
    .getAll("campus_ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (campus_ids.some((id) => !UUID_RE.test(id))) {
    fieldErrors.campus_ids = "One or more campuses are invalid.";
  }

  if (scope_type === "campus_specific") {
    if (!primary_campus_id || primary_campus_id === "__invalid__") {
      fieldErrors.primary_campus_id = "Select the campus for this profile.";
    }
  }
  if (scope_type === "church_wide" && primary_campus_id) {
    fieldErrors.primary_campus_id =
      "Church-wide profiles cannot have a primary campus.";
  }
  if (scope_type === "selected_campuses" && campus_ids.length === 0) {
    fieldErrors.campus_ids = "Select at least one campus.";
  }

  const restriction_start_date = optionalDate(
    formData,
    "restriction_start_date",
  );
  const restriction_end_date = optionalDate(formData, "restriction_end_date");
  if (restriction_start_date === "__invalid__") {
    fieldErrors.restriction_start_date = "Use a valid start date.";
  }
  if (restriction_end_date === "__invalid__") {
    fieldErrors.restriction_end_date = "Use a valid end date.";
  }
  if (
    restriction_start_date &&
    restriction_end_date &&
    restriction_start_date !== "__invalid__" &&
    restriction_end_date !== "__invalid__" &&
    restriction_end_date < restriction_start_date
  ) {
    fieldErrors.restriction_end_date =
      "End date must be on or after the start date.";
  }

  const next_review_date = optionalDate(formData, "next_review_date");
  const expires_at = optionalDate(formData, "expires_at");
  if (next_review_date === "__invalid__") {
    fieldErrors.next_review_date = "Use a valid review date.";
  }
  if (expires_at === "__invalid__") {
    fieldErrors.expires_at = "Use a valid expiration date.";
  }

  const short_note = text(formData, "short_note", 500);
  const response_guidance = text(formData, "response_guidance", 2000);

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      display_name: display_name!,
      known_aliases: text(formData, "known_aliases", 500),
      scope_type: scope_type!,
      primary_campus_id:
        scope_type === "church_wide"
          ? null
          : primary_campus_id && primary_campus_id !== "__invalid__"
            ? primary_campus_id
            : null,
      campus_ids,
      profile_status: profile_status!,
      risk_context: risk_context!,
      restriction_type: restriction_type!,
      restriction_status: restriction_status!,
      restriction_start_date:
        restriction_start_date === "__invalid__"
          ? null
          : restriction_start_date,
      restriction_end_date:
        restriction_end_date === "__invalid__" ? null : restriction_end_date,
      restriction_reference: text(formData, "restriction_reference", 500),
      short_note,
      response_guidance,
      general_notes: text(formData, "general_notes", 5000),
      last_known_context: text(formData, "last_known_context", 1000),
      related_incident_summary: text(formData, "related_incident_summary", 1000),
      next_review_date:
        next_review_date === "__invalid__" ? null : next_review_date,
      expires_at: expires_at === "__invalid__" ? null : expires_at,
    },
  };
}

export function validateSafetyConcernPhotoMetaForm(
  formData: FormData,
): SafetyConcernActionState & { data?: SafetyConcernPhotoMetaFormData } {
  const fieldErrors: Record<string, string> = {};

  const source_type = enumValue(
    formData,
    "source_type",
    SAFETY_CONCERN_PHOTO_SOURCES,
    "church_provided",
  );
  if (!source_type) {
    fieldErrors.source_type = "Select a valid photo source.";
  }

  const taken_at_raw = text(formData, "taken_at", 40);
  let taken_at: string | null = null;
  if (taken_at_raw) {
    const parsed = Date.parse(taken_at_raw);
    if (Number.isNaN(parsed)) {
      fieldErrors.taken_at = "Use a valid date and time.";
    } else {
      taken_at = new Date(parsed).toISOString();
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      photo_context_note: text(formData, "photo_context_note", 500),
      source_type: source_type!,
      source_reference: text(formData, "source_reference", 500),
      is_primary: String(formData.get("is_primary") ?? "") === "on",
      taken_at,
    },
  };
}

export function validateSafetyConcernIncidentLinkForm(
  formData: FormData,
): SafetyConcernActionState & {
  data?: {
    incident_id: string;
    relationship_type: SafetyConcernIncidentRelationship;
    notes: string | null;
  };
} {
  const fieldErrors: Record<string, string> = {};
  const incident_id = optionalUuid(formData, "incident_id");
  if (!incident_id || incident_id === "__invalid__") {
    fieldErrors.incident_id = "Select a valid incident.";
  }

  const relationship_type = enumValue(
    formData,
    "relationship_type",
    SAFETY_CONCERN_INCIDENT_RELATIONSHIPS,
    "other",
  );
  if (!relationship_type) {
    fieldErrors.relationship_type = "Select a relationship type.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      incident_id: incident_id!,
      relationship_type: relationship_type!,
      notes: text(formData, "notes", 1000),
    },
  };
}

export function isValidReviewIntervalDays(
  value: number,
): value is 90 | 180 | 365 {
  return (SAFETY_CONCERN_REVIEW_INTERVALS as readonly number[]).includes(value);
}

export function validateSafetyConcernChurchSettingsForm(formData: FormData): {
  fieldErrors?: Record<string, string>;
  data?: SafetyConcernChurchSettings;
  error?: string;
} {
  const fieldErrors: Record<string, string> = {};
  const intervalRaw = Number(String(formData.get("review_interval_days") ?? ""));
  if (!isValidReviewIntervalDays(intervalRaw)) {
    fieldErrors.review_interval_days = "Select 90, 180, or 365 days.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: "Fix the highlighted settings." };
  }

  return {
    data: {
      allow_security_member_view:
        formData.get("allow_security_member_view") === "true",
      review_interval_days: intervalRaw as 90 | 180 | 365,
      require_linked_incident:
        formData.get("require_linked_incident") === "true",
      require_photo_to_activate:
        formData.get("require_photo_to_activate") === "true",
    },
  };
}

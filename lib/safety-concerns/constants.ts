import type {
  SafetyConcernIncidentRelationship,
  SafetyConcernPhotoSource,
  SafetyConcernProfileStatus,
  SafetyConcernRestrictionStatus,
  SafetyConcernRestrictionType,
  SafetyConcernReviewOutcome,
  SafetyConcernRiskContext,
  SafetyConcernScopeType,
} from "@/lib/safety-concerns/types";

export const SAFETY_CONCERN_SCOPE_TYPES: {
  value: SafetyConcernScopeType;
  label: string;
}[] = [
  { value: "church_wide", label: "Church-wide" },
  { value: "campus_specific", label: "Single campus" },
  { value: "selected_campuses", label: "Selected campuses" },
];

export const SAFETY_CONCERN_PROFILE_STATUSES: {
  value: SafetyConcernProfileStatus;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "under_review", label: "Under review" },
  { value: "expired", label: "Expired" },
  { value: "archived", label: "Archived" },
];

export const SAFETY_CONCERN_RISK_CONTEXTS: {
  value: SafetyConcernRiskContext;
  label: string;
}[] = [
  { value: "no_trespass_order", label: "No-trespass order" },
  { value: "documented_threat", label: "Documented threat" },
  { value: "previous_security_incident", label: "Previous security incident" },
  { value: "harassment", label: "Harassment" },
  { value: "stalking_concern", label: "Stalking concern" },
  { value: "violent_behavior", label: "Violent behavior" },
  { value: "weapon_related_concern", label: "Weapon-related concern" },
  { value: "disruptive_behavior", label: "Disruptive behavior" },
  { value: "restricted_access", label: "Restricted access" },
  { value: "law_enforcement_advisory", label: "Law enforcement advisory" },
  { value: "other_documented_concern", label: "Other documented concern" },
];

export const SAFETY_CONCERN_RESTRICTION_TYPES: {
  value: SafetyConcernRestrictionType;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "verbal_no_trespass", label: "Verbal no-trespass" },
  { value: "written_no_trespass", label: "Written no-trespass" },
  { value: "court_order", label: "Court order" },
  { value: "restraining_order", label: "Restraining order" },
  { value: "limited_access", label: "Limited access" },
  { value: "staff_escort_required", label: "Staff escort required" },
  {
    value: "law_enforcement_contact_required",
    label: "Law enforcement contact required",
  },
  { value: "other", label: "Other" },
];

export const SAFETY_CONCERN_RESTRICTION_STATUSES: {
  value: SafetyConcernRestrictionStatus;
  label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "rescinded", label: "Rescinded" },
  { value: "pending_review", label: "Pending review" },
  { value: "not_applicable", label: "Not applicable" },
];

export const SAFETY_CONCERN_PHOTO_SOURCES: {
  value: SafetyConcernPhotoSource;
  label: string;
}[] = [
  { value: "church_provided", label: "Church provided" },
  { value: "incident_attachment", label: "Incident attachment" },
  { value: "law_enforcement_provided", label: "Law enforcement provided" },
  { value: "publicly_available", label: "Publicly available" },
  { value: "security_camera_still", label: "Security camera still" },
  { value: "other_authorized_source", label: "Other authorized source" },
];

export const SAFETY_CONCERN_INCIDENT_RELATIONSHIPS: {
  value: SafetyConcernIncidentRelationship;
  label: string;
}[] = [
  { value: "created_from_incident", label: "Created from incident" },
  { value: "person_involved", label: "Person involved" },
  { value: "person_observed", label: "Person observed" },
  { value: "restriction_violation", label: "Restriction violation" },
  { value: "follow_up", label: "Follow-up" },
  { value: "other", label: "Other" },
];

export const SAFETY_CONCERN_REVIEW_OUTCOMES: {
  value: SafetyConcernReviewOutcome;
  label: string;
}[] = [
  { value: "confirmed_active", label: "Confirmed active" },
  { value: "updated", label: "Updated" },
  { value: "expired", label: "Marked expired" },
  { value: "archived", label: "Archived" },
  { value: "needs_follow_up", label: "Needs follow-up" },
];

export const SAFETY_CONCERN_REVIEW_INTERVALS = [90, 180, 365] as const;

export const SAFETY_CONCERN_FACTUAL_NOTE_GUIDANCE =
  "Use factual, behavior-based language. Avoid opinions, diagnoses, insults, assumptions, or protected characteristics.";

export const SAFETY_CONCERN_RESTRICTED_BANNER =
  "Restricted security information. Access and activity may be audited.";

/** Statuses shown in the default security browse carousel. */
export const SAFETY_CONCERN_BROWSE_STATUSES: SafetyConcernProfileStatus[] = [
  "active",
  "under_review",
  "expired",
];

export function labelForSafetyConcernEnum<T extends string>(
  options: { value: T; label: string }[],
  value: T | string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

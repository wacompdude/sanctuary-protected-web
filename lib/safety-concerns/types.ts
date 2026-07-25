export type SafetyConcernScopeType =
  | "church_wide"
  | "campus_specific"
  | "selected_campuses";

export type SafetyConcernProfileStatus =
  | "draft"
  | "active"
  | "under_review"
  | "expired"
  | "archived";

export type SafetyConcernRiskContext =
  | "no_trespass_order"
  | "documented_threat"
  | "previous_security_incident"
  | "harassment"
  | "stalking_concern"
  | "violent_behavior"
  | "weapon_related_concern"
  | "disruptive_behavior"
  | "restricted_access"
  | "law_enforcement_advisory"
  | "other_documented_concern";

export type SafetyConcernRestrictionType =
  | "none"
  | "verbal_no_trespass"
  | "written_no_trespass"
  | "court_order"
  | "restraining_order"
  | "limited_access"
  | "staff_escort_required"
  | "law_enforcement_contact_required"
  | "other";

export type SafetyConcernRestrictionStatus =
  | "active"
  | "expired"
  | "rescinded"
  | "pending_review"
  | "not_applicable";

export type SafetyConcernPhotoSource =
  | "incident_attachment"
  | "church_provided"
  | "law_enforcement_provided"
  | "publicly_available"
  | "security_camera_still"
  | "other_authorized_source";

export type SafetyConcernIncidentRelationship =
  | "created_from_incident"
  | "person_involved"
  | "person_observed"
  | "restriction_violation"
  | "follow_up"
  | "other";

export type SafetyConcernReviewOutcome =
  | "confirmed_active"
  | "updated"
  | "expired"
  | "archived"
  | "needs_follow_up";

export type SafetyConcernProfile = {
  id: string;
  church_id: string;
  scope_type: SafetyConcernScopeType;
  primary_campus_id: string | null;
  display_name: string;
  known_aliases: string | null;
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
  approved_by: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  expires_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};

export type SafetyConcernPhoto = {
  id: string;
  church_id: string;
  profile_id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string;
  file_size_bytes: number;
  width: number | null;
  height: number | null;
  photo_context_note: string | null;
  is_primary: boolean;
  display_order: number;
  source_type: SafetyConcernPhotoSource;
  source_reference: string | null;
  taken_at: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Set only after authorized signed-URL generation. Never persist. */
  signed_url?: string | null;
};

export type SafetyConcernProfileCampus = {
  id: string;
  church_id: string;
  profile_id: string;
  campus_id: string;
  created_at: string;
};

export type SafetyConcernIncidentLink = {
  id: string;
  church_id: string;
  profile_id: string;
  incident_id: string;
  relationship_type: SafetyConcernIncidentRelationship;
  notes: string | null;
  linked_by: string | null;
  created_at: string;
};

export type SafetyConcernReview = {
  id: string;
  church_id: string;
  profile_id: string;
  reviewed_by: string;
  reviewed_at: string;
  outcome: SafetyConcernReviewOutcome;
  notes: string | null;
  previous_next_review_date: string | null;
  new_next_review_date: string | null;
  created_at: string;
};

/** Ephemeral photo payload for browse / mobile swipe (do not persist URLs). */
export type SafetyConcernBrowsePhoto = {
  id: string;
  signedUrl: string | null;
  contextNote: string | null;
  isPrimary: boolean;
  /** Stable swipe index hint (primary already sorted first by browse query). */
  displayOrder: number;
};

/** Mobile-ready browse card model (signed URL is ephemeral). */
export type SafetyConcernBrowseItem = {
  id: string;
  displayName: string;
  status: SafetyConcernProfileStatus;
  primaryPhotoUrl: string | null;
  photoCount: number;
  photos: SafetyConcernBrowsePhoto[];
  shortNote: string | null;
  responseGuidance: string | null;
  aliases: string | null;
  restriction: {
    type: SafetyConcernRestrictionType;
    status: SafetyConcernRestrictionStatus;
    endDate: string | null;
    label: string;
  } | null;
  campusNames: string[];
  lastReviewedAt: string | null;
  nextReviewDate: string | null;
};

export type SafetyConcernChurchSettings = {
  allow_security_member_view: boolean;
  review_interval_days: 90 | 180 | 365;
  require_linked_incident: boolean;
  require_photo_to_activate: boolean;
};

export type SafetyConcernActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export type SafetyConcernListOptions = {
  /** Include archived/draft for managers. Default false = active browse set. */
  includeInactive?: boolean;
  status?: SafetyConcernProfileStatus | SafetyConcernProfileStatus[];
  campusFilterOr?: string | null;
  /** Filter to church-wide profiles plus those scoped to this campus. */
  campusId?: string | null;
  search?: string | null;
  restrictionType?: SafetyConcernRestrictionType | null;
  /** Only profiles with next_review_date on or before today. */
  reviewDue?: boolean;
  /** Only profiles linked to this same-church incident. */
  linkedIncidentId?: string | null;
  limit?: number;
  offset?: number;
};

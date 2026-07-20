import type { ActionState } from "@/lib/church/types";

export type ScheduleEventType =
  | "worship_service"
  | "special_service"
  | "youth_event"
  | "children_event"
  | "community_event"
  | "wedding"
  | "funeral"
  | "concert"
  | "conference"
  | "training"
  | "meeting"
  | "security_drill"
  | "maintenance"
  | "other";

export type ScheduleEventStatus =
  | "draft"
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "archived";

export type ScheduleRiskLevel = "low" | "medium" | "high" | "critical";

export type ScheduleCalendarView = "month" | "week" | "day" | "agenda";

export type ScheduleEvent = {
  id: string;
  church_id: string;
  campus_id: string | null;
  title: string;
  description: string | null;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  location_name: string | null;
  building: string | null;
  room: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_rule: string | null;
  recurrence_end_at: string | null;
  parent_event_id: string | null;
  security_coverage_required: boolean;
  estimated_attendance: number | null;
  risk_level: ScheduleRiskLevel;
  recommended_notification_group_ids: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  archived_at: string | null;
  campus_name?: string | null;
  shift_count?: number;
};

export type ScheduleEventListResult = {
  items: ScheduleEvent[];
  total: number;
  page: number;
  pageSize: number;
  tablesAvailable: boolean;
};

export type ScheduleCalendarItem = {
  id: string;
  kind: "event";
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  risk_level: ScheduleRiskLevel;
  campus_id: string | null;
  campus_name: string | null;
  location_name: string | null;
  href: string;
  accessible_label: string;
};

export type ScheduleActionState = ActionState & {
  eventId?: string;
  shiftId?: string;
  assignmentId?: string;
  conflicts?: ScheduleConflict[];
};

export type CampusOption = {
  id: string;
  name: string;
  status?: string | null;
};

export type ScheduleShiftType =
  | "security"
  | "medical"
  | "parking"
  | "entrance"
  | "roaming"
  | "camera_monitoring"
  | "communications"
  | "leadership"
  | "setup"
  | "cleanup"
  | "training"
  | "other";

export type ScheduleShiftStatus =
  | "draft"
  | "open"
  | "partially_staffed"
  | "fully_staffed"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export type SchedulePriority = "low" | "normal" | "high" | "critical";

export type ScheduleAssignmentRole =
  | "team_lead"
  | "security_member"
  | "medical_responder"
  | "parking"
  | "door_monitor"
  | "rover"
  | "camera_monitor"
  | "communications"
  | "backup"
  | "other";

export type ScheduleAssignmentStatus =
  | "pending"
  | "invited"
  | "accepted"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show";

export type ScheduleConflictType =
  | "unavailable"
  | "overlapping_shift"
  | "missing_certification"
  | "inactive_membership"
  | "campus_restriction"
  | "event_cancelled"
  | "shift_cancelled"
  | "maximum_hours"
  | "other";

export type ScheduleConflictSeverity = "blocker" | "warning";

export type ScheduleConflict = {
  conflict_type: ScheduleConflictType;
  severity: ScheduleConflictSeverity;
  message: string;
  related_record_id: string | null;
  override_allowed: boolean;
};

export type ScheduleShift = {
  id: string;
  church_id: string;
  campus_id: string | null;
  event_id: string | null;
  title: string;
  description: string | null;
  shift_type: ScheduleShiftType;
  status: ScheduleShiftStatus;
  start_at: string;
  end_at: string;
  timezone: string;
  location_name: string | null;
  building: string | null;
  room: string | null;
  required_member_count: number;
  minimum_certified_member_count: number;
  required_certifications: string[];
  lead_member_required: boolean;
  priority: SchedulePriority;
  notes: string | null;
  allow_outside_event_window: boolean;
  recommended_notification_group_ids: string[];
  confirmed_assignment_count: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  archived_at: string | null;
  campus_name?: string | null;
  event_title?: string | null;
  open_positions?: number;
};

export type ShiftAssignment = {
  id: string;
  church_id: string;
  shift_id: string;
  membership_id: string | null;
  user_id: string | null;
  assignment_role: ScheduleAssignmentRole;
  status: ScheduleAssignmentStatus;
  assigned_by: string | null;
  assigned_at: string;
  responded_at: string | null;
  confirmed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  notes: string | null;
  decline_note: string | null;
  conflict_override: boolean;
  conflict_override_reason: string | null;
  conflict_overridden_by: string | null;
  created_at: string;
  updated_at: string;
  member_name?: string | null;
  member_email?: string | null;
  shift_title?: string | null;
  shift_start_at?: string | null;
  shift_end_at?: string | null;
};

export type ScheduleShiftListResult = {
  items: ScheduleShift[];
  total: number;
  page: number;
  pageSize: number;
  tablesAvailable: boolean;
};

export type EligibleMemberOption = {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  role: string;
  warnings: ScheduleConflict[];
  blockers: ScheduleConflict[];
};

export type UnavailabilityReason =
  | "personal"
  | "work"
  | "travel"
  | "medical"
  | "vacation"
  | "school"
  | "family"
  | "other";

export type UnavailabilityStatus = "active" | "cancelled" | "expired";

export type MemberUnavailability = {
  id: string;
  church_id: string;
  membership_id: string;
  user_id: string;
  title: string | null;
  reason_category: UnavailabilityReason;
  /** Private notes — only present for the owner or when explicitly loaded. */
  notes: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  recurrence_rule: string | null;
  recurrence_end_at: string | null;
  parent_unavailability_id: string | null;
  status: UnavailabilityStatus;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  member_name?: string | null;
};

export type TeamAvailabilityRow = {
  membershipId: string;
  userId: string;
  name: string;
  role: string;
  unavailableBlocks: Array<{
    id: string;
    start_at: string;
    end_at: string;
    all_day: boolean;
    title: string | null;
    reason_category: UnavailabilityReason;
  }>;
  assignments: Array<{
    id: string;
    shift_id: string;
    shift_title: string;
    start_at: string;
    end_at: string;
    status: string;
  }>;
  conflictCount: number;
};

export type AvailabilityConflictRow = {
  membershipId: string;
  memberName: string;
  unavailabilityId: string;
  unavailabilityStart: string;
  unavailabilityEnd: string;
  assignmentId: string;
  shiftId: string;
  shiftTitle: string;
  shiftStart: string;
  shiftEnd: string;
  assignmentStatus: string;
  overridden: boolean;
};

export type ChurchScheduleSettings = {
  id: string;
  church_id: string;
  default_calendar_view: ScheduleCalendarView;
  week_starts_on: number;
  default_event_duration_minutes: number;
  default_shift_duration_minutes: number;
  timezone: string;
  display_unavailable_periods: boolean;
  display_training_events: boolean;
  display_maintenance_events: boolean;
  require_assignment_confirmation: boolean;
  prevent_assignment_during_unavailability: boolean;
  allow_conflict_override: boolean;
  require_override_reason: boolean;
  enforce_certification_requirements: boolean;
  minimum_staffing_warning_enabled: boolean;
  minimum_rest_minutes: number | null;
  maximum_weekly_hours: number | null;
  assignment_invitation_email_enabled: boolean;
  assignment_confirmation_email_enabled: boolean;
  assignment_change_email_enabled: boolean;
  assignment_cancellation_email_enabled: boolean;
  default_first_reminder_minutes: number;
  default_second_reminder_minutes: number;
  unfilled_shift_warning_minutes: number;
  schedule_digest_enabled: boolean;
  schedule_digest_day: number;
  schedule_digest_time: string;
  members_may_create_unavailability: boolean;
  members_may_edit_future_unavailability: boolean;
  members_may_decline_assignments: boolean;
  decline_reason_required: boolean;
  members_may_view_team_schedule: boolean;
  members_may_volunteer_open_shifts: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type ScheduleTemplateShiftDefinition = {
  title: string;
  shift_type: ScheduleShiftType;
  offset_minutes: number;
  duration_minutes: number;
  required_member_count: number;
  location_name?: string | null;
  notes?: string | null;
};

export type ScheduleTemplate = {
  id: string;
  church_id: string;
  campus_id: string | null;
  name: string;
  description: string | null;
  event_type: ScheduleEventType;
  default_duration_minutes: number;
  default_location: string | null;
  default_shift_definitions: ScheduleTemplateShiftDefinition[];
  default_required_group_ids: string[];
  default_notification_settings: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  campus_name?: string | null;
};

export type ScheduleDashboardSummary = {
  tablesAvailable: boolean;
  upcomingEvents: number;
  todaysShifts: number;
  unfilledShifts: number;
  pendingResponses: number;
  unavailableToday: number;
  upcomingTraining: number;
  myNextShift: {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
  } | null;
};

export type TrainingDeliveryMethod =
  | "in_person_classroom"
  | "online"
  | "webinar"
  | "practical_exercise"
  | "drill"
  | "scenario_based"
  | "self_paced"
  | "external_provider"
  | "hybrid"
  | "other";

export type TrainingEventStatus =
  | "draft"
  | "scheduled"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "postponed"
  | "archived";

export type TrainingEnrollmentStatus =
  | "invited"
  | "assigned"
  | "registered"
  | "waitlisted"
  | "declined"
  | "cancelled"
  | "removed";

export type TrainingAttendanceStatus =
  | "not_recorded"
  | "present"
  | "absent"
  | "late"
  | "left_early"
  | "excused"
  | "attended_remotely";

export type TrainingCompletionStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "passed"
  | "failed"
  | "incomplete"
  | "exempt"
  | "cancelled";

export type TrainingAssignmentType =
  | "user"
  | "security_group"
  | "team"
  | "role"
  | "campus"
  | "all_security";

export type TrainingExternalVerificationStatus =
  | "not_reviewed"
  | "pending_verification"
  | "verified"
  | "rejected";

export type TrainingCompletionSource =
  | "event"
  | "external"
  | "manual_correction"
  | "import";

export type TrainingRenewalStatus =
  | "current"
  | "due_soon"
  | "due"
  | "overdue"
  | "exempt";

export interface TrainingCategory {
  id: string;
  organization_id: string | null;
  system_key: string | null;
  name: string;
  description: string | null;
  is_system: boolean;
  sensitive: boolean;
  default_renewal_months: number | null;
  required_documentation: string | null;
  is_required_default: boolean;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrainingCategoryChurchState {
  id: string;
  organization_id: string;
  category_id: string;
  active: boolean;
  display_order: number | null;
  is_required: boolean | null;
  description_override: string | null;
}

export interface TrainingCategoryWithState extends TrainingCategory {
  effective_active: boolean;
  effective_display_order: number;
  effective_is_required: boolean;
  description_effective: string | null;
}

export interface TrainingCourse {
  id: string;
  organization_id: string | null;
  training_category_id: string;
  system_key: string | null;
  course_code: string | null;
  name: string;
  description: string | null;
  objective: string | null;
  default_duration_minutes: number | null;
  delivery_method: TrainingDeliveryMethod;
  recommended_audience: string | null;
  renewal_months: number | null;
  required: boolean;
  passing_score: number | null;
  prerequisites: string | null;
  completion_requirements: string | null;
  instructor_requirements: string | null;
  creates_certification: boolean;
  certification_type: string | null;
  is_system: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
  category?: Pick<TrainingCategory, "id" | "name" | "sensitive"> | null;
}

export interface TrainingEvent {
  id: string;
  organization_id: string;
  campus_id: string | null;
  training_course_id: string | null;
  training_category_id: string | null;
  name: string;
  description: string | null;
  objective: string | null;
  format: TrainingDeliveryMethod;
  location: string | null;
  room: string | null;
  instructor_name: string | null;
  instructor_user_id: string | null;
  provider_name: string | null;
  start_at: string | null;
  end_at: string | null;
  time_zone: string;
  duration_minutes: number | null;
  maximum_participants: number | null;
  registration_deadline: string | null;
  required: boolean;
  status: TrainingEventStatus;
  target_audience: string | null;
  materials_required: string | null;
  completion_requirements: string | null;
  passing_score: number | null;
  notes: string | null;
  allow_self_registration: boolean;
  is_drill: boolean;
  creates_certification: boolean;
  certification_type: string | null;
  cost_total: number | null;
  created_at: string;
  updated_at: string;
  campus?: { id: string; name: string } | null;
  course?: Pick<TrainingCourse, "id" | "name" | "renewal_months"> | null;
  category?: Pick<TrainingCategory, "id" | "name" | "sensitive" | "default_renewal_months"> | null;
}

export interface TrainingParticipant {
  id: string;
  organization_id: string;
  training_event_id: string;
  user_id: string;
  enrollment_status: TrainingEnrollmentStatus;
  attendance_status: TrainingAttendanceStatus;
  completion_status: TrainingCompletionStatus;
  registered_at: string | null;
  attended_at: string | null;
  completed_at: string | null;
  score: number | null;
  passed: boolean | null;
  training_hours: number | null;
  exemption_status: boolean;
  exemption_reason: string | null;
  instructor_notes: string | null;
  administrative_notes: string | null;
  member_name?: string | null;
  member_email?: string | null;
}

export interface TrainingRequirement {
  id: string;
  organization_id: string;
  name: string;
  training_course_id: string | null;
  training_category_id: string | null;
  assignment_type: TrainingAssignmentType;
  user_id: string | null;
  security_group_id: string | null;
  team_id: string | null;
  role_key: string | null;
  campus_id: string | null;
  effective_at: string;
  due_at: string | null;
  renewal_months: number | null;
  grace_period_days: number;
  minimum_hours: number | null;
  minimum_score: number | null;
  exemption_allowed: boolean;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  course?: Pick<TrainingCourse, "id" | "name"> | null;
  category?: Pick<TrainingCategory, "id" | "name"> | null;
}

export interface TrainingCompletionRecord {
  id: string;
  organization_id: string;
  campus_id: string | null;
  user_id: string;
  training_event_id: string | null;
  training_course_id: string | null;
  training_category_id: string | null;
  training_participant_id: string | null;
  course_name: string;
  category_name: string | null;
  event_name: string | null;
  instructor_name: string | null;
  provider_name: string | null;
  training_date: string | null;
  completed_at: string;
  training_hours: number | null;
  score: number | null;
  passed: boolean | null;
  completion_status: TrainingCompletionStatus;
  renewal_due_at: string | null;
  source_type: TrainingCompletionSource;
  sensitive: boolean;
  archived: boolean;
  notes: string | null;
  member_name?: string | null;
  renewal_status?: TrainingRenewalStatus;
}

export interface TrainingExternalRecord {
  id: string;
  organization_id: string;
  user_id: string;
  training_category_id: string | null;
  course_name: string;
  category_name: string | null;
  provider_name: string | null;
  instructor_name: string | null;
  location: string | null;
  completion_date: string;
  training_hours: number | null;
  score: number | null;
  renewal_due_at: string | null;
  verification_status: TrainingExternalVerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  completion_record_id: string | null;
  notes: string | null;
  created_at: string;
  member_name?: string | null;
}

export interface TrainingChurchSettings {
  organization_id: string;
  due_soon_days: number;
  reminder_at_assignment: boolean;
  reminder_days_before: number[];
  reminder_day_of: boolean;
  reminder_days_after_missed: number;
  notify_on_completion: boolean;
  notify_on_cancel: boolean;
  /** Metric card background colors keyed by TrainingMetricCardKey. */
  dashboard_metric_colors: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface TrainingDashboardMetrics {
  upcomingEvents: number;
  completedThisMonth: number;
  uncompletedTrainings: number;
  overdueRenewals: number;
  dueSoonRenewals: number;
  activeRequirements: number;
  pendingExternalVerification: number;
}

export interface TrainingAccessResult {
  allowed: boolean;
  upgradeMessage: string;
}

export type TrainingActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

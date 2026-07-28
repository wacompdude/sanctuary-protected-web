export const TRAINING_UPGRADE_MESSAGE =
  "Training Management is available with Steward Pro, Shepherd Plus, and Omni Enterprise plans.";

export const TRAINING_MIGRATION_HINT =
  "Training Management tables are not available yet. Run supabase/migrations/062_training_management.sql (and later training migrations) in the Supabase SQL Editor.";

export function trainingMigrationHintFromError(message: string): string | null {
  const lower = message.toLowerCase();
  if (
    lower.includes("training_") &&
    (lower.includes("does not exist") ||
      lower.includes("relation") ||
      lower.includes("schema cache") ||
      lower.includes("dashboard_metric_colors"))
  ) {
    return TRAINING_MIGRATION_HINT;
  }
  return null;
}

export const TRAINING_EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  postponed: "Postponed",
  archived: "Archived",
};

export const TRAINING_DELIVERY_METHOD_LABELS: Record<string, string> = {
  in_person_classroom: "In-person classroom",
  online: "Online",
  webinar: "Webinar",
  practical_exercise: "Practical exercise",
  drill: "Drill",
  scenario_based: "Scenario-based",
  self_paced: "Self-paced",
  external_provider: "External provider",
  hybrid: "Hybrid",
  other: "Other",
};

export const TRAINING_ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  not_recorded: "Not recorded",
  present: "Present",
  absent: "Absent",
  late: "Late",
  left_early: "Left early",
  excused: "Excused",
  attended_remotely: "Attended remotely",
};

export const TRAINING_COMPLETION_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  passed: "Passed",
  failed: "Failed",
  incomplete: "Incomplete",
  exempt: "Exempt",
  cancelled: "Cancelled",
};

export const TRAINING_ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  user: "Individual",
  security_group: "Security group",
  team: "Team",
  role: "Role",
  campus: "Campus",
  all_security: "All security",
};

export const DEFAULT_DUE_SOON_DAYS = 30;

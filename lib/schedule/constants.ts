import type { MembershipRole } from "@/lib/church/types";

export const SCHEDULE_MIGRATION_HINT =
  "Scheduling tables are not available yet. Apply supabase/migrations/035_schedule_management.sql in the Supabase SQL Editor, then refresh.";

export const SCHEDULE_EVENT_TYPES = [
  { value: "worship_service", label: "Worship service" },
  { value: "special_service", label: "Special service" },
  { value: "youth_event", label: "Youth event" },
  { value: "children_event", label: "Children’s event" },
  { value: "community_event", label: "Community event" },
  { value: "wedding", label: "Wedding" },
  { value: "funeral", label: "Funeral" },
  { value: "concert", label: "Concert" },
  { value: "conference", label: "Conference" },
  { value: "training", label: "Training" },
  { value: "meeting", label: "Meeting" },
  { value: "security_drill", label: "Security drill" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
] as const;

export const SCHEDULE_EVENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;

export const SCHEDULE_RISK_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export const SCHEDULE_SHIFT_TYPES = [
  { value: "security", label: "Security" },
  { value: "medical", label: "Medical" },
  { value: "parking", label: "Parking" },
  { value: "entrance", label: "Entrance" },
  { value: "roaming", label: "Roaming" },
  { value: "camera_monitoring", label: "Camera monitoring" },
  { value: "communications", label: "Communications" },
  { value: "leadership", label: "Leadership" },
  { value: "setup", label: "Setup" },
  { value: "cleanup", label: "Cleanup" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
] as const;

export const SCHEDULE_SHIFT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "partially_staffed", label: "Partially staffed" },
  { value: "fully_staffed", label: "Fully staffed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const SCHEDULE_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export const SCHEDULE_ASSIGNMENT_ROLES = [
  { value: "team_lead", label: "Team lead" },
  { value: "security_member", label: "Security member" },
  { value: "medical_responder", label: "Medical responder" },
  { value: "parking", label: "Parking" },
  { value: "door_monitor", label: "Door monitor" },
  { value: "rover", label: "Rover" },
  { value: "camera_monitor", label: "Camera monitor" },
  { value: "communications", label: "Communications" },
  { value: "backup", label: "Backup" },
  { value: "other", label: "Other" },
] as const;

export const SCHEDULE_ASSIGNMENT_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "invited", label: "Invited" },
  { value: "accepted", label: "Accepted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
  { value: "no_show", label: "No-show" },
] as const;

export const SCHEDULE_UNAVAILABILITY_REASONS = [
  { value: "personal", label: "Personal" },
  { value: "work", label: "Work" },
  { value: "travel", label: "Travel" },
  { value: "medical", label: "Medical" },
  { value: "vacation", label: "Vacation" },
  { value: "school", label: "School" },
  { value: "family", label: "Family" },
  { value: "other", label: "Other" },
] as const;

export const SCHEDULE_UNAVAILABILITY_STATUSES = [
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
] as const;

export const ACTIVE_ASSIGNMENT_STATUSES = [
  "pending",
  "invited",
  "accepted",
  "confirmed",
  "completed",
] as const;

export const CONFIRMED_STAFFING_STATUSES = [
  "accepted",
  "confirmed",
  "completed",
] as const;

export const SCHEDULE_MANAGER_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
  "security_leader",
];

export function labelForScheduleEventType(value: string): string {
  return (
    SCHEDULE_EVENT_TYPES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForScheduleEventStatus(value: string): string {
  return (
    SCHEDULE_EVENT_STATUSES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForScheduleRiskLevel(value: string): string {
  return (
    SCHEDULE_RISK_LEVELS.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForScheduleShiftType(value: string): string {
  return (
    SCHEDULE_SHIFT_TYPES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForScheduleShiftStatus(value: string): string {
  return (
    SCHEDULE_SHIFT_STATUSES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForSchedulePriority(value: string): string {
  return (
    SCHEDULE_PRIORITIES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForScheduleAssignmentRole(value: string): string {
  return (
    SCHEDULE_ASSIGNMENT_ROLES.find((item) => item.value === value)?.label ??
    value
  );
}

export function labelForScheduleAssignmentStatus(value: string): string {
  return (
    SCHEDULE_ASSIGNMENT_STATUSES.find((item) => item.value === value)?.label ??
    value
  );
}

export function labelForUnavailabilityReason(value: string): string {
  return (
    SCHEDULE_UNAVAILABILITY_REASONS.find((item) => item.value === value)
      ?.label ?? value
  );
}

export function labelForUnavailabilityStatus(value: string): string {
  return (
    SCHEDULE_UNAVAILABILITY_STATUSES.find((item) => item.value === value)
      ?.label ?? value
  );
}

export function scheduleMigrationHintFromError(message: string): string | null {
  if (
    /schedule_events|schedule_shifts|shift_assignments|member_unavailability|church_schedule_settings|schedule_templates|PGRST205|42P01|does not exist/i.test(
      message,
    )
  ) {
    return SCHEDULE_MIGRATION_HINT;
  }
  return null;
}

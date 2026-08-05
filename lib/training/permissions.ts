import { hasMinRole } from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/security/permission-keys";

export function canViewTraining(role: MembershipRole): boolean {
  return hasMinRole(role, "security_member") || role === "training_coordinator";
}

export function canManageEvents(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader") || role === "training_coordinator";
}

export function canRecordAttendance(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader") || role === "training_coordinator";
}

export function canManageSettings(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canViewSensitive(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canViewCosts(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canRunReports(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader") || role === "training_coordinator";
}

export function canManageCourses(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator") || role === "training_coordinator";
}

export function canManageRequirements(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator") || role === "training_coordinator";
}

export function canVerifyExternalTraining(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canSubmitExternalTraining(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader") || role === "training_coordinator";
}

/** Permission keys conceptually required for common training actions. */
export const TRAINING_ACTION_PERMISSIONS = {
  viewDashboard: [PERMISSION_KEYS.TRAINING_VIEW] as PermissionKey[],
  viewEvents: [PERMISSION_KEYS.TRAINING_EVENTS_VIEW] as PermissionKey[],
  createEvent: [PERMISSION_KEYS.TRAINING_EVENTS_CREATE] as PermissionKey[],
  editEvent: [PERMISSION_KEYS.TRAINING_EVENTS_EDIT] as PermissionKey[],
  cancelEvent: [PERMISSION_KEYS.TRAINING_EVENTS_CANCEL] as PermissionKey[],
  recordAttendance: [PERMISSION_KEYS.TRAINING_ATTENDANCE_RECORD] as PermissionKey[],
  recordCompletion: [PERMISSION_KEYS.TRAINING_COMPLETION_RECORD] as PermissionKey[],
  manageCourses: [PERMISSION_KEYS.TRAINING_COURSES_MANAGE] as PermissionKey[],
  manageCategories: [PERMISSION_KEYS.TRAINING_CATEGORIES_MANAGE] as PermissionKey[],
  manageRequirements: [PERMISSION_KEYS.TRAINING_REQUIREMENTS_MANAGE] as PermissionKey[],
  viewSensitive: [PERMISSION_KEYS.TRAINING_SENSITIVE_VIEW] as PermissionKey[],
  viewCosts: [PERMISSION_KEYS.TRAINING_COSTS_VIEW] as PermissionKey[],
  manageSettings: [PERMISSION_KEYS.TRAINING_SETTINGS_MANAGE] as PermissionKey[],
  runReports: [PERMISSION_KEYS.TRAINING_REPORTS_RUN] as PermissionKey[],
  exportReports: [PERMISSION_KEYS.TRAINING_REPORTS_EXPORT] as PermissionKey[],
} as const;

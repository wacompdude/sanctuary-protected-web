import { hasMinRole } from "@/lib/church/navigation";
import type { MembershipRole } from "@/lib/church/types";

export function canManageSchedule(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

export function canOverrideScheduleConflicts(role: MembershipRole): boolean {
  return canManageSchedule(role);
}

export function canViewTeamUnavailability(role: MembershipRole): boolean {
  return canManageSchedule(role);
}

export function canManageScheduleSettings(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canViewSchedule(role: MembershipRole): boolean {
  return hasMinRole(role, "viewer");
}

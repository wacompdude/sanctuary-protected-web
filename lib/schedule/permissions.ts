import { hasMinRole } from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";

export function canManageSchedule(role: MembershipRole): boolean {
  return (
    hasMinRole(role, "security_leader") || role === "event_coordinator"
  );
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

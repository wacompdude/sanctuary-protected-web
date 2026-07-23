import type { MembershipRole } from "@/lib/church/types";
import { canManageChurchSettings } from "@/lib/church/settings";
import { canManageSchedule } from "@/lib/schedule/permissions";

export function canViewDashboardCustomization(role: MembershipRole): boolean {
  return canManageChurchSettings(role);
}

export function canManageDashboardCustomization(role: MembershipRole): boolean {
  return canManageChurchSettings(role);
}

export function canViewDashboardScheduleManagerBoxes(
  role: MembershipRole,
): boolean {
  return canManageSchedule(role);
}

/** Throws when the membership cannot edit church dashboard presentation. */
export function assertCanManageDashboardCustomization(
  role: MembershipRole,
): void {
  if (!canManageDashboardCustomization(role)) {
    throw new Error(
      "You do not have permission to customize the dashboard.",
    );
  }
}

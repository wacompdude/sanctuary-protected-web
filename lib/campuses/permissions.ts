import { hasMinRole } from "@/lib/church/navigation";
import type { MembershipRole } from "@/lib/church/types";
import type { CampusRole } from "@/lib/campuses/types";

/** View campus directory (list/detail). */
export function canViewCampuses(role: MembershipRole): boolean {
  return hasMinRole(role, "security_member");
}

/** Create/update campuses, set primary, change status. */
export function canManageCampuses(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

/**
 * Implicit access to all campuses (no campus_memberships required).
 * Matches DB has_church_wide_campus_ops_access.
 */
export function hasImplicitAllCampusAccess(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

/** Church-level managers who can assign campus memberships for any campus. */
export function canManageCampusMembershipsByChurchRole(
  role: MembershipRole,
): boolean {
  return hasMinRole(role, "administrator");
}

/** Campus-scoped managers who may assign members on their campus. */
export function canManageCampusMembershipsByCampusRole(
  campusRole: CampusRole | string | null | undefined,
): boolean {
  return (
    campusRole === "campus_leader" || campusRole === "campus_administrator"
  );
}

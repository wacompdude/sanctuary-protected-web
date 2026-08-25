import { hasMinRole } from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";
import type { CampusRole } from "@/lib/campuses/types";
import {
  churchRoleGrantsCampusAction,
  isTopLevelCampusAdminRole,
} from "@/lib/campuses/campus-policy";

/** View campus directory (list/detail). */
export function canViewCampuses(role: MembershipRole): boolean {
  return hasMinRole(role, "security_member") || isTopLevelCampusAdminRole(role);
}

/** Create/update campuses, set primary, change status. */
export function canManageCampuses(role: MembershipRole): boolean {
  return churchRoleGrantsCampusAction(role, "create");
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
  return churchRoleGrantsCampusAction(role, "members.manage");
}

/**
 * @deprecated Campus membership management is granted through security roles
 * and groups, not ordinary campus_leader team membership. Kept for compatibility
 * with campus_administrator assignments only.
 */
export function canManageCampusMembershipsByCampusRole(
  campusRole: CampusRole | string | null | undefined,
): boolean {
  return campusRole === "campus_administrator";
}

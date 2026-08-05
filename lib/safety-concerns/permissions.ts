import { hasMinRole } from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";

/** Roles that may manage profiles, photos, notes, and archives. */
export function canManageSafetyConcerns(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

/**
 * Roles that may view profiles when the church is entitled.
 * Church setting may still deny security_member (enforced in entitlements helper).
 */
export function canViewSafetyConcernsWhenEntitled(role: MembershipRole): boolean {
  return hasMinRole(role, "security_member");
}

/** Settings page: owners and administrators. */
export function canManageSafetyConcernSettings(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

/** Review history / audit-style pages within the module. */
export function canReadSafetyConcernAudit(role: MembershipRole): boolean {
  return canManageSafetyConcerns(role);
}

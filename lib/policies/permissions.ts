import { hasMinRole } from "@/lib/church/navigation";
import type { MembershipRole } from "@/lib/church/types";

export const POLICY_MANAGEMENT_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
  "security_leader",
];

export const POLICY_SETTINGS_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
];

export function canViewPolicies(role: MembershipRole): boolean {
  return hasMinRole(role, "viewer");
}

export function canManagePolicyDocuments(role: MembershipRole): boolean {
  return POLICY_MANAGEMENT_ROLES.includes(role);
}

export function canManagePolicySettings(role: MembershipRole): boolean {
  return POLICY_SETTINGS_ROLES.includes(role);
}

export function canViewPolicyManagement(role: MembershipRole): boolean {
  return canManagePolicyDocuments(role);
}

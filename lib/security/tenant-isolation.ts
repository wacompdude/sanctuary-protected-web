/**
 * Pure helpers for security-group tenant isolation (Stage 3A).
 * Used by authorization evaluation and self-checks — no I/O.
 */

export type SecurityGroupMembershipScopeInput = {
  userId: string;
  organizationId: string;
  membershipOrganizationId?: string | null;
  groupOrganizationId?: string | null;
  groupStatus?: string | null;
  membershipStatus?: string | null;
};

/**
 * A group membership may grant permissions only when it belongs to the
 * organization under evaluation and the parent group matches that org.
 */
export function isSecurityGroupMembershipInOrganization(
  input: SecurityGroupMembershipScopeInput,
): boolean {
  const orgId = input.organizationId.trim();
  const userId = input.userId.trim();
  if (!orgId || !userId) return false;
  if ((input.membershipStatus ?? "active") !== "active") return false;
  if ((input.groupStatus ?? "active") !== "active") return false;
  const memberOrg = (input.membershipOrganizationId ?? "").trim();
  const groupOrg = (input.groupOrganizationId ?? "").trim();
  return memberOrg === orgId && groupOrg === orgId;
}

export type SecurityGroupPermissionScopeInput = {
  evaluationOrganizationId: string;
  groupOrganizationId?: string | null;
  groupStatus?: string | null;
  permissionEffect?: string | null;
};

export function isSecurityGroupPermissionInOrganization(
  input: SecurityGroupPermissionScopeInput,
): boolean {
  const orgId = input.evaluationOrganizationId.trim();
  if (!orgId) return false;
  if ((input.groupStatus ?? "active") !== "active") return false;
  if ((input.permissionEffect ?? "grant") !== "grant") return false;
  return (input.groupOrganizationId ?? "").trim() === orgId;
}

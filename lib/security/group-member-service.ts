import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeAssignmentStatus,
  validateAssignmentDates,
  type ComputedAssignmentStatus,
} from "@/lib/security/group-member-utils";
import {
  getSecurityGroup,
  getSecurityGroupMemberById,
  getSecurityGroupMembers,
  getSecurityGroupPermissions,
  getUserSecurityGroupMemberships,
} from "@/lib/security/repository";
import type {
  PermissionScopeType,
  SecurityGroup,
  SecurityGroupMember,
} from "@/lib/security/types";
import { listAllPermissions } from "@/lib/security/repository";

export type EnrichedGroupMemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  churchRole: string;
  campusId: string | null;
  campusName: string | null;
  scopeType: PermissionScopeType;
  scopeLabel: string;
  assignmentStatus: ComputedAssignmentStatus;
  dbStatus: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  assignedByUserId: string;
  assignedByName: string;
  assignedAt: string;
  assignmentReason: string | null;
  administrativeNotes: string | null;
  isTemporary: boolean;
};

export async function assertGroupInOrganization(
  admin: SupabaseClient,
  groupId: string,
  organizationId: string,
): Promise<SecurityGroup> {
  const group = await getSecurityGroup(admin, groupId);
  if (!group || group.organization_id !== organizationId) {
    throw new Error("Security group not found");
  }
  return group;
}

export function assertNotSelfElevation(
  actorUserId: string,
  targetUserIds: string[],
  group: SecurityGroup,
): void {
  if (!group.high_risk) return;
  if (targetUserIds.includes(actorUserId)) {
    throw new Error("You cannot assign yourself to a high-risk security role");
  }
}

export function assertHighRiskReason(
  group: SecurityGroup,
  reason: string | null | undefined,
): void {
  if (group.high_risk && !reason?.trim()) {
    throw new Error("Assignment reason is required for high-risk security roles");
  }
}

export async function enrichGroupMemberRows(params: {
  members: SecurityGroupMember[];
  teamByUserId: Map<
    string,
    {
      name: string;
      email: string | null;
      role: string;
      avatarUrl: string | null;
    }
  >;
  campusById: Map<string, string>;
  peopleById: Map<string, { name: string; label: string }>;
}): Promise<EnrichedGroupMemberRow[]> {
  const { members, teamByUserId, campusById, peopleById } = params;

  return members.map((member) => {
    const profile = teamByUserId.get(member.user_id);
    const campusName = member.campus_id
      ? campusById.get(member.campus_id) ?? null
      : null;
    const scopeType =
      (member.scope_type as PermissionScopeType | undefined) ??
      "all_current_future_campuses";
    const assignmentStatus = computeAssignmentStatus({
      status: member.status,
      effectiveAt: member.effective_at,
      expiresAt: member.expires_at,
    });
    const assignedBy = peopleById.get(member.assigned_by);

    return {
      membershipId: member.id,
      userId: member.user_id,
      name: profile?.name ?? "Unknown user",
      email: profile?.email ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      churchRole: profile?.role ?? "unknown",
      campusId: member.campus_id ?? null,
      campusName,
      scopeType,
      scopeLabel: campusName ?? scopeType.replaceAll("_", " "),
      assignmentStatus,
      dbStatus: member.status,
      effectiveAt: member.effective_at,
      expiresAt: member.expires_at,
      assignedByUserId: member.assigned_by,
      assignedByName: assignedBy?.name ?? "Unknown user",
      assignedAt: member.assigned_at,
      assignmentReason: member.assignment_reason ?? null,
      administrativeNotes: member.administrative_notes ?? null,
      isTemporary: Boolean(member.expires_at),
    };
  });
}

export async function previewGroupMemberRemovalImpact(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    groupId: string;
    userId: string;
  },
): Promise<{
  willLose: Array<{ permissionKey: string; displayName: string }>;
  willRetain: Array<{ permissionKey: string; displayName: string; source: string }>;
}> {
  const [groupPermissions, catalog, userGroups] = await Promise.all([
    getSecurityGroupPermissions(admin, params.groupId),
    listAllPermissions(admin),
    getUserSecurityGroupMemberships(admin, params.userId, params.organizationId),
  ]);

  const catalogById = new Map(catalog.map((row) => [row.id, row]));
  const removingKeys = new Set(
    groupPermissions
      .filter((row) => row.permission_effect === "grant")
      .map((row) => catalogById.get(row.permission_definition_id)?.permission_key)
      .filter((key): key is string => Boolean(key)),
  );

  const retainedFromOtherGroups = new Map<string, string>();
  for (const row of userGroups) {
    if (row.group.id === params.groupId) continue;
    const perms = await getSecurityGroupPermissions(admin, row.group.id);
    for (const perm of perms) {
      if (perm.permission_effect !== "grant") continue;
      const key = catalogById.get(perm.permission_definition_id)?.permission_key;
      if (key) retainedFromOtherGroups.set(key, row.group.name);
    }
  }

  const willLose: Array<{ permissionKey: string; displayName: string }> = [];
  const willRetain: Array<{ permissionKey: string; displayName: string; source: string }> =
    [];

  for (const key of removingKeys) {
    const def = catalog.find((row) => row.permission_key === key);
    const retainedSource = retainedFromOtherGroups.get(key);
    if (retainedSource) {
      willRetain.push({
        permissionKey: key,
        displayName: def?.display_name ?? key,
        source: retainedSource,
      });
    } else {
      willLose.push({
        permissionKey: key,
        displayName: def?.display_name ?? key,
      });
    }
  }

  return { willLose, willRetain };
}

export async function assertActiveMembershipAssignment(
  admin: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<void> {
  const existing = await getSecurityGroupMembers(admin, groupId, true);
  if (existing.some((member) => member.user_id === userId)) {
    throw new Error("User is already assigned to this security role");
  }
}

export function parseAssignmentInput(input: {
  effectiveAt?: string | null;
  expiresAt?: string | null;
}): { effectiveAt: string | null; expiresAt: string | null; error: string | null } {
  const effectiveAt = input.effectiveAt?.trim() || null;
  const expiresAt = input.expiresAt?.trim() || null;
  const error = validateAssignmentDates({ effectiveAt, expiresAt });
  return { effectiveAt, expiresAt, error };
}

export async function loadGroupMemberForMutation(
  admin: SupabaseClient,
  membershipId: string,
  organizationId: string,
  groupId: string,
): Promise<SecurityGroupMember> {
  const member = await getSecurityGroupMemberById(admin, membershipId, organizationId);
  if (!member || member.security_group_id !== groupId) {
    throw new Error("Group membership not found");
  }
  if (member.status !== "active") {
    throw new Error("Only active assignments can be modified");
  }
  return member;
}

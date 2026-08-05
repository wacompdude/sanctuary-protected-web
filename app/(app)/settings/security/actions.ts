/**
 * app/(app)/settings/security/actions.ts
 * Server actions for security settings operations.
 */

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveChurch } from "@/lib/church/context";
import { requireMinChurchRole } from "@/lib/church/auth";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { labelForMembershipRole } from "@/lib/church/invitations";
import {
  canChangeRole,
  canChangeStatus,
  labelForMembershipStatus,
  parseMembershipRoleSafe,
  parseMembershipStatus,
  rolesActorMayAssign,
} from "@/lib/church/team";
import type { MembershipRole, MembershipStatus } from "@/lib/church/types";
import {
  createSecurityGroup,
  updateSecurityGroup,
  addUserToSecurityGroup,
  removeUserFromSecurityGroup,
  getSecurityGroup,
  getSecurityGroupMembers,
  listSecurityGroups,
  getUserDirectPermissions,
  listAllPermissions,
  getSecurityGroupPermissions,
  addPermissionToSecurityGroup,
  removePermissionFromSecurityGroup,
  getUserSecurityGroups,
  getUserSecurityGroupMemberships,
  grantUserPermission,
  denyUserPermission,
  updateUserPermission,
  getUserPermissionById,
  revokeUserPermission,
  listChurchUserPermissions,
  listPermissionGrantHolders,
  canUserPerform,
} from "@/lib/security";
import {
  logSecurityGroupCreated,
  logSecurityGroupUpdated,
  logSecurityGroupMemberAdded,
  logSecurityGroupMemberRemoved,
  logUserPermissionGranted,
  logUserPermissionDenied,
  logUserPermissionRevoked,
  logUserPermissionUpdated,
  logAccessPreviewUsed,
  querySecurityAuditLogs,
  writeSecurityAuditLog,
} from "@/lib/security/audit";
import {
  getSystemRoleCatalog,
  getSystemRoleEntry,
} from "@/lib/security/role-catalog";
import {
  countMembersByAnyRole,
  listActiveMembershipRolesForUser,
  listChurchRoleSettings,
  listMembersWithRole,
  setMembershipRoles,
  upsertChurchRoleSetting,
} from "@/lib/security/membership-roles";
import { getPermissionDefinitionByKey } from "@/lib/security/repository";
import type {
  PermissionScopeType,
  RoleTemplateKind,
  SecurityAuditEventType,
  SecurityGroup,
} from "@/lib/security/types";

export interface CreateSecurityGroupInput {
  name: string;
  description?: string;
  systemTemplate?: boolean;
}

export interface ChurchUserOption {
  userId: string;
  name: string;
  email: string | null;
  role: string;
}

export interface GroupMemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  role: string;
  assignedAt: string;
  effectiveAt: string | null;
  expiresAt: string | null;
}

export interface PermissionOption {
  id: string;
  permissionKey: string;
  displayName: string;
  description: string | null;
  category: string;
  riskLevel: string;
  supportsCampusScope: boolean;
}

export interface GroupPermissionRow {
  assignmentId: string;
  permissionDefinitionId: string;
  permissionKey: string;
  displayName: string;
  description: string | null;
  category: string;
  riskLevel: string;
  scopeType: string;
  assignedAt: string;
  reason: string | null;
}

export async function createSecurityGroupAction(input: CreateSecurityGroupInput) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    // Check permissions
    await requireMinChurchRole("administrator");

    const { membership } = await getActiveChurch();
    const churchId = membership.organization_id;

    // Create the group
    const group = await createSecurityGroup(admin, churchId, input.name, input.description || null, user.id);

    if (!group) {
      return { error: "Failed to create security group" };
    }

    // Audit log
    await logSecurityGroupCreated(admin, churchId, group.id, group.name, user.id);

    return { success: true, groupId: group.id };
  } catch (error) {
    console.error("Error creating security group:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export interface UpdateSecurityGroupInput {
  groupId: string;
  name?: string;
  description?: string;
  status?: "active" | "inactive";
  notes?: string;
}

export async function updateSecurityGroupAction(input: UpdateSecurityGroupInput) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const existing = await getSecurityGroup(admin, input.groupId);
    if (!existing || existing.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const updates: Partial<Pick<SecurityGroup, "name" | "description" | "status" | "notes">> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.status !== undefined) updates.status = input.status;
    if (input.notes !== undefined) updates.notes = input.notes;

    const group = await updateSecurityGroup(admin, input.groupId, updates, user.id);

    if (!group) {
      return { error: "Failed to update security group" };
    }

    await logSecurityGroupUpdated(
      admin,
      membership.organization_id,
      input.groupId,
      {
        name: existing.name,
        description: existing.description,
        status: existing.status,
        notes: existing.notes,
      },
      updates,
      user.id,
    );

    return { success: true };
  } catch (error) {
    console.error("Error updating security group:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listSecurityGroupsAction() {
  try {
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    // Check permissions
    await requireMinChurchRole("security_leader");

    const groups = await listSecurityGroups(admin, membership.organization_id);

    return { success: true, groups };
  } catch (error) {
    console.error("Error listing security groups:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getUserPermissionsAction() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    // Check permissions
    await requireMinChurchRole("security_leader");

    const { membership } = await getActiveChurch();

    const permissions = await getUserDirectPermissions(admin, user.id, membership.organization_id);

    return { success: true, permissions };
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listChurchUsersForSecurityAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const members = await listChurchTeamMemberships(membership.organization_id);

    const users: ChurchUserOption[] = members
      .filter((m) => m.status === "active")
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        email: m.email,
        role: m.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, users };
  } catch (error) {
    console.error("Error listing church users:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listSecurityGroupMembersAction(groupId: string) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const group = await getSecurityGroup(admin, groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const members = await getSecurityGroupMembers(admin, groupId, true);
    const churchMembers = await listChurchTeamMemberships(membership.organization_id);
    const byUserId = new Map(churchMembers.map((m) => [m.userId, m]));
    const { loadHiddenPlatformOperatorUserIds } = await import(
      "@/lib/platform/hidden-from-church"
    );
    const hiddenUserIds = await loadHiddenPlatformOperatorUserIds();

    const rows: GroupMemberRow[] = members
      .filter((member) => !hiddenUserIds.has(member.user_id))
      .map((member) => {
      const profile = byUserId.get(member.user_id);
      return {
        membershipId: member.id,
        userId: member.user_id,
        name: profile?.name || "Unknown user",
        email: profile?.email || null,
        role: profile?.role || "unknown",
        assignedAt: member.assigned_at,
        effectiveAt: member.effective_at,
        expiresAt: member.expires_at,
      };
    });

    return { success: true, members: rows };
  } catch (error) {
    console.error("Error listing group members:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function addSecurityGroupMemberAction(input: {
  groupId: string;
  userId: string;
  effectiveAt?: string;
  expiresAt?: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const group = await getSecurityGroup(admin, input.groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const churchMembers = await listChurchTeamMemberships(membership.organization_id);
    const target = churchMembers.find(
      (m) => m.userId === input.userId && m.status === "active",
    );
    if (!target) {
      return { error: "Selected user is not an active member of this church" };
    }

    const existing = await getSecurityGroupMembers(admin, input.groupId, true);
    if (existing.some((m) => m.user_id === input.userId)) {
      return { error: "User is already a member of this group" };
    }

    const member = await addUserToSecurityGroup(
      admin,
      input.groupId,
      input.userId,
      user.id,
      input.effectiveAt,
      input.expiresAt,
    );

    if (!member) {
      return { error: "Failed to add user to security group" };
    }

    await logSecurityGroupMemberAdded(
      admin,
      membership.organization_id,
      input.groupId,
      input.userId,
      user.id,
    );

    return { success: true, membershipId: member.id };
  } catch (error) {
    console.error("Error adding group member:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function removeSecurityGroupMemberAction(input: {
  groupId: string;
  membershipId: string;
  userId: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const group = await getSecurityGroup(admin, input.groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const removed = await removeUserFromSecurityGroup(
      admin,
      input.membershipId,
      user.id,
    );

    if (!removed) {
      return { error: "Failed to remove user from security group" };
    }

    await logSecurityGroupMemberRemoved(
      admin,
      membership.organization_id,
      input.groupId,
      input.userId,
      user.id,
    );

    return { success: true };
  } catch (error) {
    console.error("Error removing group member:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listPermissionCatalogAction() {
  try {
    await requireMinChurchRole("security_leader");
    const admin = createAdminClient();
    const permissions = await listAllPermissions(admin);

    const options: PermissionOption[] = permissions
      .map((p) => ({
        id: p.id,
        permissionKey: p.permission_key,
        displayName: p.display_name,
        description: p.description,
        category: p.category,
        riskLevel: p.risk_level,
        supportsCampusScope: p.supports_campus_scope,
      }))
      .sort((a, b) => {
        const categoryCompare = a.category.localeCompare(b.category);
        if (categoryCompare !== 0) return categoryCompare;
        return a.displayName.localeCompare(b.displayName);
      });

    return { success: true, permissions: options };
  } catch (error) {
    console.error("Error listing permission catalog:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export interface PermissionGrantHolderRow {
  userId: string;
  userName: string;
  userEmail: string | null;
  userRole: string | null;
  source: "direct" | "group";
  effect: string;
  status: string;
  isTemporary: boolean;
  expiresAt: string | null;
  groupId: string | null;
  groupName: string | null;
  reason: string | null;
}

export async function listPermissionGrantHoldersAction(
  permissionDefinitionId: string,
) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const [holders, churchMembers] = await Promise.all([
      listPermissionGrantHolders(
        admin,
        membership.organization_id,
        permissionDefinitionId,
      ),
      listChurchTeamMemberships(membership.organization_id),
    ]);

    const byUser = new Map(churchMembers.map((m) => [m.userId, m]));
    const rows: PermissionGrantHolderRow[] = [];
    const seen = new Set<string>();

    for (const grant of holders.direct) {
      const member = byUser.get(grant.userId);
      // Hide platform operators even if they somehow have a grant.
      if (!member) continue;
      const key = `direct:${grant.userId}:${grant.effect}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        userId: grant.userId,
        userName: member.name,
        userEmail: member.email,
        userRole: member.role,
        source: "direct",
        effect: grant.effect,
        status: grant.status,
        isTemporary: Boolean(grant.expiresAt),
        expiresAt: grant.expiresAt,
        groupId: null,
        groupName: null,
        reason: grant.reason,
      });
    }

    for (const group of holders.groups) {
      for (const memberGrant of group.members) {
        const member = byUser.get(memberGrant.userId);
        if (!member) continue;
        const key = `group:${group.groupId}:${memberGrant.userId}:${group.effect}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          userId: memberGrant.userId,
          userName: member.name,
          userEmail: member.email,
          userRole: member.role,
          source: "group",
          effect: group.effect,
          status: memberGrant.membershipStatus,
          isTemporary: Boolean(
            group.expiresAt || memberGrant.membershipExpiresAt,
          ),
          expiresAt: memberGrant.membershipExpiresAt || group.expiresAt,
          groupId: group.groupId,
          groupName: group.groupName,
          reason: null,
        });
      }
    }

    rows.sort((a, b) => {
      const nameCompare = a.userName.localeCompare(b.userName);
      if (nameCompare !== 0) return nameCompare;
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return (a.groupName || "").localeCompare(b.groupName || "");
    });

    return {
      success: true,
      holders: rows,
      summary: {
        directCount: rows.filter((r) => r.source === "direct").length,
        groupCount: rows.filter((r) => r.source === "group").length,
        uniqueUsers: new Set(rows.map((r) => r.userId)).size,
      },
    };
  } catch (error) {
    console.error("Error listing permission grant holders:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listSecurityGroupPermissionsAction(groupId: string) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const group = await getSecurityGroup(admin, groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const [assignments, catalog] = await Promise.all([
      getSecurityGroupPermissions(admin, groupId),
      listAllPermissions(admin),
    ]);

    const byId = new Map(catalog.map((p) => [p.id, p]));

    const rows: GroupPermissionRow[] = assignments
      .map((assignment) => {
        const def = byId.get(assignment.permission_definition_id);
        return {
          assignmentId: assignment.id,
          permissionDefinitionId: assignment.permission_definition_id,
          permissionKey: def?.permission_key || "unknown",
          displayName: def?.display_name || "Unknown permission",
          description: def?.description || null,
          category: def?.category || "other",
          riskLevel: def?.risk_level || "low",
          scopeType: assignment.scope_type,
          assignedAt: assignment.assigned_at,
          reason: assignment.reason,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { success: true, permissions: rows };
  } catch (error) {
    console.error("Error listing group permissions:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function addSecurityGroupPermissionAction(input: {
  groupId: string;
  permissionDefinitionId: string;
  scopeType?: PermissionScopeType;
  reason?: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const group = await getSecurityGroup(admin, input.groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const catalog = await listAllPermissions(admin);
    const permission = catalog.find((p) => p.id === input.permissionDefinitionId);
    if (!permission) {
      return { error: "Permission not found" };
    }

    const existing = await getSecurityGroupPermissions(admin, input.groupId);
    if (existing.some((p) => p.permission_definition_id === input.permissionDefinitionId)) {
      return { error: "This permission is already assigned to the group" };
    }

    const scopeType = input.scopeType || "all_current_future_campuses";
    const assignment = await addPermissionToSecurityGroup(
      admin,
      input.groupId,
      input.permissionDefinitionId,
      user.id,
      scopeType,
      null,
      null,
      null,
      input.reason || null,
    );

    if (!assignment) {
      return { error: "Failed to assign permission to security group" };
    }

    await writeSecurityAuditLog(admin, {
      churchId: membership.organization_id,
      actorUserId: user.id,
      securityGroupId: input.groupId,
      permissionDefinitionId: input.permissionDefinitionId,
      eventType: "security_group.updated",
      newValue: {
        action: "permission_added",
        permission_key: permission.permission_key,
        scope_type: scopeType,
      },
      reason: input.reason || `Assigned ${permission.permission_key} to group`,
    });

    return { success: true, assignmentId: assignment.id };
  } catch (error) {
    console.error("Error adding group permission:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function removeSecurityGroupPermissionAction(input: {
  groupId: string;
  assignmentId: string;
  permissionDefinitionId: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { error: "Not authenticated" };
    }

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const group = await getSecurityGroup(admin, input.groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const existing = await getSecurityGroupPermissions(admin, input.groupId);
    const assignment = existing.find((p) => p.id === input.assignmentId);
    if (!assignment) {
      return { error: "Permission assignment not found" };
    }

    const removed = await removePermissionFromSecurityGroup(admin, input.assignmentId);
    if (!removed) {
      return { error: "Failed to remove permission from security group" };
    }

    await writeSecurityAuditLog(admin, {
      churchId: membership.organization_id,
      actorUserId: user.id,
      securityGroupId: input.groupId,
      permissionDefinitionId: input.permissionDefinitionId,
      eventType: "security_group.updated",
      previousValue: {
        action: "permission_removed",
        assignment_id: input.assignmentId,
      },
      reason: "Removed permission from security group",
    });

    return { success: true };
  } catch (error) {
    console.error("Error removing group permission:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export interface UserAccessRow {
  userId: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  groupCount: number;
  directPermissionCount: number;
  temporaryPermissionCount: number;
  expiringSoonCount: number;
}

export interface UserPermissionRow {
  id: string;
  permissionDefinitionId: string;
  permissionKey: string;
  displayName: string;
  effect: "grant" | "deny";
  scopeType: string;
  status: string;
  effectiveAt: string | null;
  expiresAt: string | null;
  reason: string | null;
  assignedAt: string;
}

export interface TemporaryGrantRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  permissionDefinitionId: string;
  permissionKey: string;
  displayName: string;
  effect: string;
  status: string;
  effectiveAt: string | null;
  expiresAt: string;
  reason: string | null;
  assignedAt: string;
}

export interface CampusOption {
  id: string;
  name: string;
  status: string;
  isPrimary?: boolean;
}

export interface AuditLogRow {
  id: string;
  createdAt: string;
  eventType: string;
  result: string;
  actorName: string;
  targetName: string | null;
  reason: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  securityGroupId: string | null;
  permissionDefinitionId: string | null;
}

export interface SecurityOverviewMetrics {
  totalGroups: number;
  totalUsers: number;
  usersWithDirectPermissions: number;
  usersWithTemporaryPermissions: number;
  permissionsExpiring7Days: number;
  permissionsExpiring30Days: number;
  usersWithAllCampusAccess: number;
  highRiskPermissionAssignments: number;
}

function enrichUserPermissions(
  permissions: Awaited<ReturnType<typeof getUserDirectPermissions>>,
  catalog: Awaited<ReturnType<typeof listAllPermissions>>,
): UserPermissionRow[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  return permissions.map((permission) => {
    const def = byId.get(permission.permission_definition_id);
    return {
      id: permission.id,
      permissionDefinitionId: permission.permission_definition_id,
      permissionKey: def?.permission_key || "unknown",
      displayName: def?.display_name || "Unknown permission",
      effect: permission.permission_effect,
      scopeType: permission.scope_type,
      status: permission.status,
      effectiveAt: permission.effective_at,
      expiresAt: permission.expires_at,
      reason: permission.reason,
      assignedAt: permission.assigned_at,
    };
  });
}

export async function getSecurityOverviewMetricsAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = membership.organization_id;

    const [groups, churchMembers, userPermissions, catalog] = await Promise.all([
      listSecurityGroups(admin, churchId),
      listChurchTeamMemberships(churchId),
      listChurchUserPermissions(admin, churchId),
      listAllPermissions(admin),
    ]);

    const activeMembers = churchMembers.filter((m) => m.status === "active");
    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    const in30 = now + 30 * 24 * 60 * 60 * 1000;

    const usersWithDirect = new Set(userPermissions.map((p) => p.user_id));
    const usersWithTemp = new Set(
      userPermissions.filter((p) => p.expires_at).map((p) => p.user_id),
    );

    const expiring7 = userPermissions.filter((p) => {
      if (!p.expires_at) return false;
      const expires = new Date(p.expires_at).getTime();
      return expires >= now && expires <= in7;
    }).length;

    const expiring30 = userPermissions.filter((p) => {
      if (!p.expires_at) return false;
      const expires = new Date(p.expires_at).getTime();
      return expires >= now && expires <= in30;
    }).length;

    const allCampusUsers = new Set(
      userPermissions
        .filter(
          (p) =>
            p.scope_type === "all_current_future_campuses" ||
            p.scope_type === "all_current_campuses" ||
            p.scope_type === "no_restriction",
        )
        .map((p) => p.user_id),
    );

    const highRiskIds = new Set(
      catalog.filter((p) => p.risk_level === "high").map((p) => p.id),
    );
    const highRiskAssignments = userPermissions.filter((p) =>
      highRiskIds.has(p.permission_definition_id),
    ).length;

    const metrics: SecurityOverviewMetrics = {
      totalGroups: groups.length,
      totalUsers: activeMembers.length,
      usersWithDirectPermissions: usersWithDirect.size,
      usersWithTemporaryPermissions: usersWithTemp.size,
      permissionsExpiring7Days: expiring7,
      permissionsExpiring30Days: expiring30,
      usersWithAllCampusAccess: allCampusUsers.size,
      highRiskPermissionAssignments: highRiskAssignments,
    };

    return { success: true, metrics };
  } catch (error) {
    console.error("Error loading security overview metrics:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deactivateSecurityGroupAction(groupId: string) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();
    const group = await getSecurityGroup(admin, groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const updated = await updateSecurityGroup(admin, groupId, { status: "inactive" }, user.id);
    if (!updated) return { error: "Failed to deactivate security group" };

    await writeSecurityAuditLog(admin, {
      churchId: membership.organization_id,
      actorUserId: user.id,
      securityGroupId: groupId,
      eventType: "security_group.deactivated",
      previousValue: { status: group.status },
      newValue: { status: "inactive" },
      reason: `Deactivated group: ${group.name}`,
    });

    return { success: true };
  } catch (error) {
    console.error("Error deactivating security group:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function duplicateSecurityGroupAction(groupId: string) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();
    const group = await getSecurityGroup(admin, groupId);
    if (!group || group.organization_id !== membership.organization_id) {
      return { error: "Security group not found" };
    }

    const created = await createSecurityGroup(
      admin,
      membership.organization_id,
      `${group.name} (Copy)`,
      group.description,
      user.id,
    );
    if (!created) return { error: "Failed to duplicate security group" };

    const permissions = await getSecurityGroupPermissions(admin, groupId);
    for (const permission of permissions) {
      await addPermissionToSecurityGroup(
        admin,
        created.id,
        permission.permission_definition_id,
        user.id,
        permission.scope_type,
        permission.campus_id,
        permission.effective_at,
        permission.expires_at,
        permission.reason,
      );
    }

    await logSecurityGroupCreated(
      admin,
      membership.organization_id,
      created.id,
      created.name,
      user.id,
    );

    return { success: true, groupId: created.id };
  } catch (error) {
    console.error("Error duplicating security group:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listUsersAccessAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = membership.organization_id;

    const [churchMembers, allDirect, allGroups] = await Promise.all([
      listChurchTeamMemberships(churchId),
      listChurchUserPermissions(admin, churchId),
      listSecurityGroups(admin, churchId, false),
    ]);

    const membershipsByUser = new Map<string, number>();
    for (const group of allGroups.filter((g) => g.status === "active")) {
      const members = await getSecurityGroupMembers(admin, group.id, true);
      for (const member of members) {
        membershipsByUser.set(
          member.user_id,
          (membershipsByUser.get(member.user_id) || 0) + 1,
        );
      }
    }

    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;

    const users: UserAccessRow[] = churchMembers.map((member) => {
      const direct = allDirect.filter((p) => p.user_id === member.userId);
      const temporary = direct.filter((p) => p.expires_at);
      const permanent = direct.filter((p) => !p.expires_at);
      const expiringSoon = temporary.filter((p) => {
        const expires = new Date(p.expires_at!).getTime();
        return expires >= now && expires <= in7;
      });

      return {
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
        groupCount: membershipsByUser.get(member.userId) || 0,
        directPermissionCount: permanent.length,
        temporaryPermissionCount: temporary.length,
        expiringSoonCount: expiringSoon.length,
      };
    });

    return { success: true, users };
  } catch (error) {
    console.error("Error listing users access:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export interface UserGroupMembershipRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  isTemporary: boolean;
  effectiveAt: string | null;
  expiresAt: string | null;
  assignedAt: string;
}

export async function getUserAccessDetailsAction(userId: string) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = membership.organization_id;

    const [groupMemberships, direct, catalog] = await Promise.all([
      getUserSecurityGroupMemberships(admin, userId, churchId),
      getUserDirectPermissions(admin, userId, churchId),
      listAllPermissions(admin),
    ]);

    const groups: UserGroupMembershipRow[] = groupMemberships.map((row) => ({
      id: row.group.id,
      name: row.group.name,
      description: row.group.description,
      status: row.group.status,
      isTemporary: Boolean(row.membership.expires_at),
      effectiveAt: row.membership.effective_at,
      expiresAt: row.membership.expires_at,
      assignedAt: row.membership.assigned_at,
    }));

    return {
      success: true,
      groups,
      permissions: enrichUserPermissions(direct, catalog),
    };
  } catch (error) {
    console.error("Error loading user access details:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function grantDirectUserPermissionAction(input: {
  userId: string;
  permissionDefinitionId: string;
  effect?: "grant" | "deny";
  scopeType?: PermissionScopeType;
  effectiveAt?: string;
  expiresAt?: string;
  reason?: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();
    const catalog = await listAllPermissions(admin);
    const permission = catalog.find((p) => p.id === input.permissionDefinitionId);
    if (!permission) return { error: "Permission not found" };

    const churchMembers = await listChurchTeamMemberships(membership.organization_id);
    const target = churchMembers.find(
      (m) => m.userId === input.userId && m.status === "active",
    );
    if (!target) return { error: "Selected user is not an active church member" };

    const effect = input.effect || "grant";
    const scopeType = input.scopeType || "all_current_future_campuses";

    const created =
      effect === "deny"
        ? await denyUserPermission(
            admin,
            input.userId,
            membership.organization_id,
            input.permissionDefinitionId,
            user.id,
            scopeType,
            null,
            input.effectiveAt || null,
            input.expiresAt || null,
            input.reason || null,
            null,
          )
        : await grantUserPermission(
            admin,
            input.userId,
            membership.organization_id,
            input.permissionDefinitionId,
            user.id,
            scopeType,
            null,
            input.effectiveAt || null,
            input.expiresAt || null,
            input.reason || null,
            null,
          );

    if (!created) return { error: `Failed to ${effect} permission` };

    if (effect === "deny") {
      await logUserPermissionDenied(
        admin,
        membership.organization_id,
        input.userId,
        permission.permission_key,
        user.id,
        input.reason,
      );
    } else {
      await logUserPermissionGranted(
        admin,
        membership.organization_id,
        input.userId,
        permission.permission_key,
        user.id,
        input.reason,
      );
    }

    return { success: true, permissionId: created.id };
  } catch (error) {
    console.error("Error granting direct permission:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function revokeDirectUserPermissionAction(input: {
  permissionId: string;
  userId: string;
  permissionKey: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const revoked = await revokeUserPermission(admin, input.permissionId, user.id);
    if (!revoked) return { error: "Failed to revoke permission" };

    await logUserPermissionRevoked(
      admin,
      membership.organization_id,
      input.userId,
      input.permissionKey,
      user.id,
    );

    return { success: true };
  } catch (error) {
    console.error("Error revoking direct permission:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listTemporaryAccessAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const [grants, catalog, churchMembers] = await Promise.all([
      listChurchUserPermissions(admin, membership.organization_id, { temporaryOnly: true }),
      listAllPermissions(admin),
      listChurchTeamMemberships(membership.organization_id),
    ]);

    const byPerm = new Map(catalog.map((p) => [p.id, p]));
    const byUser = new Map(churchMembers.map((m) => [m.userId, m]));

    const rows: TemporaryGrantRow[] = grants
      .filter((g) => g.expires_at)
      .map((grant) => {
        const def = byPerm.get(grant.permission_definition_id);
        const member = byUser.get(grant.user_id);
        return {
          id: grant.id,
          userId: grant.user_id,
          userName: member?.name || "Unknown user",
          userEmail: member?.email || null,
          permissionDefinitionId: grant.permission_definition_id,
          permissionKey: def?.permission_key || "unknown",
          displayName: def?.display_name || "Unknown permission",
          effect: grant.permission_effect,
          status: grant.status,
          effectiveAt: grant.effective_at,
          expiresAt: grant.expires_at!,
          reason: grant.reason,
          assignedAt: grant.assigned_at,
        };
      });

    return { success: true, grants: rows };
  } catch (error) {
    console.error("Error listing temporary access:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateTemporaryAccessAction(input: {
  permissionId: string;
  permissionDefinitionId?: string;
  effect?: "grant" | "deny";
  effectiveAt?: string | null;
  expiresAt?: string;
  reason?: string | null;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const existing = await getUserPermissionById(
      admin,
      input.permissionId,
      membership.organization_id,
    );
    if (!existing) return { error: "Temporary grant not found" };
    if (!existing.expires_at) {
      return { error: "Only temporary grants can be edited here" };
    }
    if (existing.status === "revoked") {
      return { error: "Revoked grants cannot be edited" };
    }
    if (!input.expiresAt) {
      return { error: "Expiration date is required for temporary grants" };
    }

    const catalog = await listAllPermissions(admin);
    const nextPermissionId =
      input.permissionDefinitionId || existing.permission_definition_id;
    const permission = catalog.find((p) => p.id === nextPermissionId);
    if (!permission) return { error: "Permission not found" };

    const updated = await updateUserPermission(admin, input.permissionId, {
      permissionDefinitionId: nextPermissionId,
      permissionEffect: input.effect || existing.permission_effect,
      effectiveAt:
        input.effectiveAt === undefined
          ? existing.effective_at
          : input.effectiveAt,
      expiresAt: input.expiresAt,
      reason:
        input.reason === undefined ? existing.reason : input.reason?.trim() || null,
    });

    if (!updated) return { error: "Failed to update temporary grant" };

    await logUserPermissionUpdated(
      admin,
      membership.organization_id,
      existing.user_id,
      permission.permission_key,
      user.id,
      {
        permissionDefinitionId: existing.permission_definition_id,
        effect: existing.permission_effect,
        effectiveAt: existing.effective_at,
        expiresAt: existing.expires_at,
        reason: existing.reason,
        status: existing.status,
      },
      {
        permissionDefinitionId: updated.permission_definition_id,
        effect: updated.permission_effect,
        effectiveAt: updated.effective_at,
        expiresAt: updated.expires_at,
        reason: updated.reason,
        status: updated.status,
      },
      input.reason?.trim() || undefined,
    );

    return { success: true, grant: updated };
  } catch (error) {
    console.error("Error updating temporary access:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function deleteTemporaryAccessAction(input: {
  permissionId: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const existing = await getUserPermissionById(
      admin,
      input.permissionId,
      membership.organization_id,
    );
    if (!existing) return { error: "Temporary grant not found" };
    if (!existing.expires_at) {
      return { error: "Only temporary grants can be deleted here" };
    }
    if (existing.status === "revoked") {
      return { success: true };
    }

    const catalog = await listAllPermissions(admin);
    const permission = catalog.find(
      (p) => p.id === existing.permission_definition_id,
    );

    const revoked = await revokeUserPermission(
      admin,
      input.permissionId,
      user.id,
    );
    if (!revoked) return { error: "Failed to delete temporary grant" };

    await logUserPermissionRevoked(
      admin,
      membership.organization_id,
      existing.user_id,
      permission?.permission_key || "unknown",
      user.id,
      "Deleted temporary access grant",
    );

    return { success: true };
  } catch (error) {
    console.error("Error deleting temporary access:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listCampusesForSecurityAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("campuses")
      .select("id, name, status, is_primary")
      .eq("organization_id", membership.organization_id)
      .order("name", { ascending: true });

    if (error) {
      const legacy = await admin
        .from("campuses")
        .select("id, name, status")
        .eq("organization_id", membership.organization_id)
        .order("name", { ascending: true });

      if (legacy.error) {
        return { error: legacy.error.message };
      }

      const campuses: CampusOption[] = (legacy.data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        isPrimary: false,
      }));
      return { success: true, campuses };
    }

    const campuses: CampusOption[] = (data || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      isPrimary: Boolean(c.is_primary),
    }));

    return { success: true, campuses };
  } catch (error) {
    console.error("Error listing campuses:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function listSecurityAuditLogsAction(input?: {
  eventType?: SecurityAuditEventType;
  result?: "success" | "failure";
  limit?: number;
}) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const [{ logs }, churchMembers] = await Promise.all([
      querySecurityAuditLogs(admin, {
        churchId: membership.organization_id,
        eventType: input?.eventType,
        result: input?.result,
        limit: input?.limit || 100,
      }),
      listChurchTeamMemberships(membership.organization_id),
    ]);

    const byUser = new Map(churchMembers.map((m) => [m.userId, m]));

    const rows: AuditLogRow[] = (logs as any[]).map((log) => ({
      id: log.id,
      createdAt: log.created_at,
      eventType: log.event_type,
      result: log.result,
      actorName: byUser.get(log.actor_user_id)?.name || log.actor_user_id,
      targetName: log.target_user_id
        ? byUser.get(log.target_user_id)?.name || log.target_user_id
        : null,
      reason: log.reason,
      previousValue: log.previous_value,
      newValue: log.new_value,
      securityGroupId: log.security_group_id,
      permissionDefinitionId: log.permission_definition_id,
    }));

    return { success: true, logs: rows };
  } catch (error) {
    console.error("Error listing audit logs:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function previewAccessAction(input: {
  userId: string;
  permissionKey: string;
  campusId?: string;
  actionDate?: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();

    const result = await canUserPerform(admin, {
      userId: input.userId,
      churchId: membership.organization_id,
      campusId: input.campusId || null,
      permissionKey: input.permissionKey,
      actionDate: input.actionDate ? new Date(input.actionDate) : new Date(),
    });

    await logAccessPreviewUsed(
      admin,
      membership.organization_id,
      input.userId,
      input.permissionKey,
      user.id,
    );

    return { success: true, result };
  } catch (error) {
    console.error("Error previewing access:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Roles catalog + membership role assignment (Phase 3)
// ---------------------------------------------------------------------------

export type RoleCatalogRow = {
  roleKind: RoleTemplateKind;
  roleKey: string;
  displayName: string;
  description: string;
  status: "active" | "inactive";
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
  defaultPermissionKeys: string[];
};

export async function listRolesCatalogAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = membership.organization_id;

    const [settings, anyRoleCounts, catalog] = await Promise.all([
      listChurchRoleSettings(admin, churchId),
      countMembersByAnyRole(admin, churchId),
      listAllPermissions(admin),
    ]);

    const settingsMap = new Map(
      settings.map((row) => [`${row.role_kind}:${row.role_key}`, row]),
    );

    const permissionKeySet = new Set(catalog.map((p) => p.permission_key));

    const roles: RoleCatalogRow[] = getSystemRoleCatalog().map((entry) => {
      const override = settingsMap.get(`${entry.roleKind}:${entry.roleKey}`);
      const keys = entry.defaultPermissionKeys.filter((key) =>
        permissionKeySet.has(key),
      );
      return {
        roleKind: entry.roleKind,
        roleKey: entry.roleKey,
        displayName: override?.display_name_override || entry.displayName,
        description: override?.description_override || entry.description,
        status: override?.status === "inactive" ? "inactive" : "active",
        isSystem: entry.isSystem,
        userCount:
          entry.roleKind === "church" ? anyRoleCounts[entry.roleKey] || 0 : 0,
        permissionCount: keys.length,
        defaultPermissionKeys: keys,
      };
    });

    return { success: true, roles };
  } catch (error) {
    console.error("Error listing roles catalog:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export type RoleDetailMember = {
  userId: string;
  name: string;
  email: string | null;
  isPrimary: boolean;
  assignedAt: string;
};

export async function getRoleDetailAction(input: {
  roleKind: RoleTemplateKind;
  roleKey: string;
}) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = membership.organization_id;

    const entry = getSystemRoleEntry(input.roleKind, input.roleKey);
    if (!entry) return { error: "Role not found" };

    const [settings, catalog, team, history] = await Promise.all([
      listChurchRoleSettings(admin, churchId),
      listAllPermissions(admin),
      listChurchTeamMemberships(churchId),
      querySecurityAuditLogs(admin, {
        churchId,
        limit: 40,
      }),
    ]);

    const override = settings.find(
      (row) =>
        row.role_kind === input.roleKind && row.role_key === input.roleKey,
    );

    const permissionMeta = new Map(
      catalog.map((p) => [p.permission_key, p] as const),
    );
    const permissions = entry.defaultPermissionKeys
      .map((key) => permissionMeta.get(key))
      .filter(Boolean)
      .map((p) => ({
        permissionKey: p!.permission_key,
        displayName: p!.display_name,
        category: p!.category,
        riskLevel: p!.risk_level,
      }));

    let members: RoleDetailMember[] = [];
    if (input.roleKind === "church") {
      const roleMembers = await listMembersWithRole(
        admin,
        churchId,
        input.roleKey,
      );
      const byUser = new Map(team.map((m) => [m.userId, m] as const));
      members = roleMembers
        .map((row) => {
          const member = byUser.get(row.userId);
          if (!member) return null;
          return {
            userId: row.userId,
            name: member.name,
            email: member.email,
            isPrimary: row.isPrimary,
            assignedAt: row.assignedAt,
          };
        })
        .filter(Boolean) as RoleDetailMember[];
    }

    const roleHistory = (history.logs || [])
      .filter((log) => {
        const prev = log.previous_value as Record<string, unknown> | null;
        const next = log.new_value as Record<string, unknown> | null;
        return (
          prev?.role === input.roleKey ||
          next?.role === input.roleKey ||
          prev?.roleKey === input.roleKey ||
          next?.roleKey === input.roleKey ||
          String(log.reason || "").includes(input.roleKey)
        );
      })
      .slice(0, 20)
      .map((log) => ({
        id: log.id,
        eventType: log.event_type,
        actorUserId: log.actor_user_id,
        createdAt: log.created_at,
        reason: log.reason,
        previousValue: log.previous_value,
        newValue: log.new_value,
      }));

    return {
      success: true,
      role: {
        roleKind: entry.roleKind,
        roleKey: entry.roleKey,
        displayName: override?.display_name_override || entry.displayName,
        description: override?.description_override || entry.description,
        status: (override?.status === "inactive" ? "inactive" : "active") as
          | "active"
          | "inactive",
        isSystem: entry.isSystem,
        campusRestrictions:
          entry.roleKind === "campus"
            ? "Applies only on assigned campuses via campus memberships."
            : "Church-wide by default. Campus scope can still apply to individual permissions.",
      },
      permissions,
      members,
      history: roleHistory,
    };
  } catch (error) {
    console.error("Error loading role detail:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateRoleCatalogAction(input: {
  roleKind: RoleTemplateKind;
  roleKey: string;
  displayName?: string;
  description?: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const entry = getSystemRoleEntry(input.roleKind, input.roleKey);
    if (!entry) return { error: "Role not found" };

    const existing = (await listChurchRoleSettings(admin, membership.organization_id)).find(
      (row) =>
        row.role_kind === input.roleKind && row.role_key === input.roleKey,
    );

    const updated = await upsertChurchRoleSetting(admin, {
      churchId: membership.organization_id,
      roleKind: input.roleKind,
      roleKey: input.roleKey,
      displayNameOverride:
        input.displayName?.trim() || existing?.display_name_override || null,
      descriptionOverride:
        input.description?.trim() ?? existing?.description_override ?? null,
      status: existing?.status ?? "active",
      updatedBy: user.id,
    });

    if (!updated) return { error: "Failed to update role" };

    await writeSecurityAuditLog(admin, {
      churchId: membership.organization_id,
      actorUserId: user.id,
      eventType: "role.updated",
      previousValue: {
        roleKey: input.roleKey,
        displayName: existing?.display_name_override,
        description: existing?.description_override,
      },
      newValue: {
        roleKey: input.roleKey,
        displayName: updated.display_name_override,
        description: updated.description_override,
      },
      reason: `Updated role catalog: ${input.roleKey}`,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating role catalog:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function setRoleCatalogStatusAction(input: {
  roleKind: RoleTemplateKind;
  roleKey: string;
  status: "active" | "inactive";
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    if (input.roleKey === "owner" || input.roleKey === "co_owner") {
      return { error: "Ownership roles cannot be deactivated." };
    }

    const entry = getSystemRoleEntry(input.roleKind, input.roleKey);
    if (!entry) return { error: "Role not found" };

    const existing = (await listChurchRoleSettings(admin, membership.organization_id)).find(
      (row) =>
        row.role_kind === input.roleKind && row.role_key === input.roleKey,
    );

    const updated = await upsertChurchRoleSetting(admin, {
      churchId: membership.organization_id,
      roleKind: input.roleKind,
      roleKey: input.roleKey,
      displayNameOverride: existing?.display_name_override ?? null,
      descriptionOverride: existing?.description_override ?? null,
      status: input.status,
      updatedBy: user.id,
    });
    if (!updated) return { error: "Failed to update role status" };

    await writeSecurityAuditLog(admin, {
      churchId: membership.organization_id,
      actorUserId: user.id,
      eventType: input.status === "inactive" ? "role.deactivated" : "role.updated",
      previousValue: { roleKey: input.roleKey, status: existing?.status ?? "active" },
      newValue: { roleKey: input.roleKey, status: input.status },
      reason: `${input.status === "inactive" ? "Deactivated" : "Activated"} role: ${input.roleKey}`,
    });

    return { success: true };
  } catch (error) {
    console.error("Error setting role status:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function duplicateRoleAsGroupAction(input: {
  roleKind: RoleTemplateKind;
  roleKey: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership } = await getActiveChurch();

    const entry = getSystemRoleEntry(input.roleKind, input.roleKey);
    if (!entry) return { error: "Role not found" };

    const created = await createSecurityGroup(
      admin,
      membership.organization_id,
      `${entry.displayName} (from role)`,
      `Duplicated from ${entry.roleKind} role ${entry.roleKey}. ${entry.description}`,
      user.id,
    );
    if (!created) return { error: "Failed to create security group" };

    for (const permissionKey of entry.defaultPermissionKeys) {
      const def = await getPermissionDefinitionByKey(admin, permissionKey);
      if (!def) continue;
      await addPermissionToSecurityGroup(
        admin,
        created.id,
        def.id,
        user.id,
        "all_current_future_campuses",
        null,
        null,
        null,
        `From role template ${entry.roleKey}`,
      );
    }

    await logSecurityGroupCreated(
      admin,
      membership.organization_id,
      created.id,
      created.name,
      user.id,
    );

    await writeSecurityAuditLog(admin, {
      churchId: membership.organization_id,
      actorUserId: user.id,
      securityGroupId: created.id,
      eventType: "role.created",
      newValue: {
        roleKey: input.roleKey,
        roleKind: input.roleKind,
        duplicatedAsGroupId: created.id,
      },
      reason: `Duplicated role ${input.roleKey} as security group`,
    });

    return { success: true, groupId: created.id };
  } catch (error) {
    console.error("Error duplicating role as group:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export type MemberCampusAssignment = {
  id: string;
  campusId: string;
  campusName: string;
  campusRole: string;
  status: string;
  isPrimaryCampus: boolean;
};

export async function getUserMembershipEditorAction(userId: string) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership: actorMembership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = actorMembership.organization_id;

    const team = await listChurchTeamMemberships(churchId);
    const member = team.find((row) => row.userId === userId);
    if (!member) return { error: "Member not found" };

    const [roles, campusesResult, groupMemberships, direct, catalog, settings] =
      await Promise.all([
        listActiveMembershipRolesForUser(admin, churchId, userId),
        admin
          .from("campus_memberships")
          .select(
            `
            id, campus_id, campus_role, status, is_primary_campus,
            campuses ( id, name )
          `,
          )
          .eq("organization_id", churchId)
          .eq("user_id", userId)
          .neq("status", "removed"),
        getUserSecurityGroupMemberships(admin, userId, churchId),
        getUserDirectPermissions(admin, userId, churchId),
        listAllPermissions(admin),
        listChurchRoleSettings(admin, churchId),
      ]);

    const inactiveRoles = new Set(
      settings
        .filter((row) => row.role_kind === "church" && row.status === "inactive")
        .map((row) => row.role_key),
    );

    const assignableRoles = [
      ...new Set([
        ...(member.role === "owner" ? (["owner"] as MembershipRole[]) : []),
        ...rolesActorMayAssign(actorMembership.role).filter(
          (role) => !inactiveRoles.has(role),
        ),
      ]),
    ];

    const campusRows = campusesResult.error ? [] : campusesResult.data || [];
    const campuses: MemberCampusAssignment[] = campusRows.map((row) => {
      const campus = Array.isArray(row.campuses) ? row.campuses[0] : row.campuses;
      return {
        id: String(row.id),
        campusId: String(row.campus_id),
        campusName: (campus as { name?: string } | null)?.name ?? "Campus",
        campusRole: String(row.campus_role),
        status: String(row.status),
        isPrimaryCampus: Boolean(row.is_primary_campus),
      };
    });

    const primary =
      roles.find((row) => row.is_primary)?.role || member.role;
    const secondary = roles
      .filter((row) => !row.is_primary)
      .map((row) => row.role as MembershipRole);

    return {
      success: true,
      member: {
        membershipId: member.membershipId,
        userId: member.userId,
        name: member.name,
        email: member.email,
        primaryRole: primary as MembershipRole,
        secondaryRoles: secondary,
        status: member.status as MembershipStatus,
        isLastActiveOwner: member.isLastActiveOwner,
      },
      assignableRoles,
      statusOptions: [
        "active",
        "inactive",
        "on_leave",
        "suspended",
        "pending_approval",
        "invited",
        "archived",
        "removed",
      ] as MembershipStatus[],
      campuses,
      roleLabels: Object.fromEntries(
        assignableRoles.map((role) => [role, labelForMembershipRole(role)]),
      ),
      groups: groupMemberships.map((row) => ({
        id: row.group.id,
        name: row.group.name,
      })),
      permissions: enrichUserPermissions(direct, catalog),
    };
  } catch (error) {
    console.error("Error loading membership editor:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateUserMembershipRolesAction(input: {
  userId: string;
  primaryRole: string;
  secondaryRoles: string[];
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership: actorMembership } = await getActiveChurch();
    const churchId = actorMembership.organization_id;

    const team = await listChurchTeamMemberships(churchId);
    const member = team.find((row) => row.userId === input.userId);
    if (!member) return { error: "Member not found" };

    const primaryRole = parseMembershipRoleSafe(input.primaryRole);
    const secondaryRoles = input.secondaryRoles.map(parseMembershipRoleSafe);

    if (primaryRole === "owner") {
      return {
        error:
          "Use Ownership settings to transfer the primary owner role.",
      };
    }

    if (
      !canChangeRole({
        actorRole: actorMembership.role,
        actorUserId: user.id,
        targetUserId: member.userId,
        targetRole: member.role,
        targetStatus: member.status,
        nextRole: primaryRole,
      })
    ) {
      return { error: "You do not have permission to change this member's primary role." };
    }

    for (const role of secondaryRoles) {
      if (role === "owner") {
        return { error: "Owner cannot be assigned as a secondary role." };
      }
      if (!rolesActorMayAssign(actorMembership.role).includes(role as Exclude<MembershipRole, "owner">)) {
        return { error: `You cannot assign secondary role ${labelForMembershipRole(role)}.` };
      }
    }

    const previousRoles = await listActiveMembershipRolesForUser(
      admin,
      churchId,
      member.userId,
    );

    const result = await setMembershipRoles({
      admin,
      churchId,
      membershipId: member.membershipId,
      userId: member.userId,
      primaryRole,
      secondaryRoles,
      actorUserId: user.id,
    });

    if (!result.ok) return { error: result.error };

    await writeSecurityAuditLog(admin, {
      churchId,
      actorUserId: user.id,
      targetUserId: member.userId,
      eventType: "membership_role.primary_changed",
      previousValue: {
        roles: previousRoles.map((r) => ({
          role: r.role,
          isPrimary: r.is_primary,
        })),
      },
      newValue: {
        primaryRole,
        secondaryRoles,
      },
      reason: `Updated roles for ${member.name}`,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating membership roles:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function updateUserMembershipStatusAction(input: {
  userId: string;
  status: string;
}) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    await requireMinChurchRole("administrator");
    const { membership: actorMembership } = await getActiveChurch();
    const churchId = actorMembership.organization_id;

    const team = await listChurchTeamMemberships(churchId);
    const member = team.find((row) => row.userId === input.userId);
    if (!member) return { error: "Member not found" };

    const nextStatus = parseMembershipStatus(input.status);

    if (
      !canChangeStatus({
        actorRole: actorMembership.role,
        actorUserId: user.id,
        targetUserId: member.userId,
        targetRole: member.role,
        targetStatus: member.status,
        nextStatus,
        isLastActiveOwner: member.isLastActiveOwner,
      })
    ) {
      return { error: "You do not have permission to change this member's status." };
    }

    const { error } = await admin
      .from("organization_memberships")
      .update({ status: nextStatus })
      .eq("id", member.membershipId)
      .eq("organization_id", churchId);

    if (error) return { error: error.message };

    await writeSecurityAuditLog(admin, {
      churchId,
      actorUserId: user.id,
      targetUserId: member.userId,
      eventType: "membership.status_changed",
      previousValue: { status: member.status },
      newValue: { status: nextStatus },
      reason: `Status changed to ${labelForMembershipStatus(nextStatus)}`,
    });

    return { success: true };
  } catch (error) {
    console.error("Error updating membership status:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

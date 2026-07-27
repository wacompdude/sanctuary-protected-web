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
  grantUserPermission,
  denyUserPermission,
  revokeUserPermission,
  listChurchUserPermissions,
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
  logAccessPreviewUsed,
  querySecurityAuditLogs,
  writeSecurityAuditLog,
} from "@/lib/security/audit";
import type { PermissionScopeType, SecurityAuditEventType, SecurityGroup } from "@/lib/security/types";

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
    const churchId = membership.church_id;

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
    if (!existing || existing.church_id !== membership.church_id) {
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
      membership.church_id,
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

    const groups = await listSecurityGroups(admin, membership.church_id);

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

    const permissions = await getUserDirectPermissions(admin, user.id, membership.church_id);

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
    const members = await listChurchTeamMemberships(membership.church_id);

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
    if (!group || group.church_id !== membership.church_id) {
      return { error: "Security group not found" };
    }

    const members = await getSecurityGroupMembers(admin, groupId, true);
    const churchMembers = await listChurchTeamMemberships(membership.church_id);
    const byUserId = new Map(churchMembers.map((m) => [m.userId, m]));

    const rows: GroupMemberRow[] = members.map((member) => {
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
    if (!group || group.church_id !== membership.church_id) {
      return { error: "Security group not found" };
    }

    const churchMembers = await listChurchTeamMemberships(membership.church_id);
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
      membership.church_id,
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
    if (!group || group.church_id !== membership.church_id) {
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
      membership.church_id,
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

export async function listSecurityGroupPermissionsAction(groupId: string) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const group = await getSecurityGroup(admin, groupId);
    if (!group || group.church_id !== membership.church_id) {
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
    if (!group || group.church_id !== membership.church_id) {
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
      churchId: membership.church_id,
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
    if (!group || group.church_id !== membership.church_id) {
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
      churchId: membership.church_id,
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
    const churchId = membership.church_id;

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
    if (!group || group.church_id !== membership.church_id) {
      return { error: "Security group not found" };
    }

    const updated = await updateSecurityGroup(admin, groupId, { status: "inactive" }, user.id);
    if (!updated) return { error: "Failed to deactivate security group" };

    await writeSecurityAuditLog(admin, {
      churchId: membership.church_id,
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
    if (!group || group.church_id !== membership.church_id) {
      return { error: "Security group not found" };
    }

    const created = await createSecurityGroup(
      admin,
      membership.church_id,
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
      membership.church_id,
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
    const churchId = membership.church_id;

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
        directPermissionCount: direct.length,
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

export async function getUserAccessDetailsAction(userId: string) {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();
    const churchId = membership.church_id;

    const [groups, direct, catalog] = await Promise.all([
      getUserSecurityGroups(admin, userId, churchId),
      getUserDirectPermissions(admin, userId, churchId),
      listAllPermissions(admin),
    ]);

    return {
      success: true,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        status: g.status,
      })),
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

    const churchMembers = await listChurchTeamMemberships(membership.church_id);
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
            membership.church_id,
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
            membership.church_id,
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
        membership.church_id,
        input.userId,
        permission.permission_key,
        user.id,
        input.reason,
      );
    } else {
      await logUserPermissionGranted(
        admin,
        membership.church_id,
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
      membership.church_id,
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
      listChurchUserPermissions(admin, membership.church_id, { temporaryOnly: true }),
      listAllPermissions(admin),
      listChurchTeamMemberships(membership.church_id),
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

export async function listCampusesForSecurityAction() {
  try {
    await requireMinChurchRole("security_leader");
    const { membership } = await getActiveChurch();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("campuses")
      .select("id, name, status, is_primary")
      .eq("church_id", membership.church_id)
      .order("name", { ascending: true });

    if (error) {
      const legacy = await admin
        .from("campuses")
        .select("id, name, status")
        .eq("church_id", membership.church_id)
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
        churchId: membership.church_id,
        eventType: input?.eventType,
        result: input?.result,
        limit: input?.limit || 100,
      }),
      listChurchTeamMemberships(membership.church_id),
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
      churchId: membership.church_id,
      campusId: input.campusId || null,
      permissionKey: input.permissionKey,
      actionDate: input.actionDate ? new Date(input.actionDate) : new Date(),
    });

    await logAccessPreviewUsed(
      admin,
      membership.church_id,
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

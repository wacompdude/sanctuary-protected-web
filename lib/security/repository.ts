/**
 * lib/security/repository.ts
 *
 * Database query functions for security data.
 * Provides typed access to security tables.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type {
  SecurityGroup,
  SecurityGroupMember,
  SecurityGroupPermission,
  UserPermission,
  PermissionDefinition,
} from "./types";

/**
 * Get a security group by ID.
 */
export async function getSecurityGroup(
  admin: SupabaseClient,
  groupId: string,
): Promise<SecurityGroup | null> {
  const { data, error } = await admin
    .from("security_groups")
    .select("*")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch security group:", error);
    return null;
  }

  return data as SecurityGroup | null;
}

/**
 * Get all security groups for a church.
 */
export async function listSecurityGroups(
  admin: SupabaseClient,
  organizationId: string,
  activeOnly: boolean = true,
): Promise<SecurityGroup[]> {
  let query = admin.from("security_groups").select("*").eq("organization_id", organizationId);

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to list security groups:", error);
    return [];
  }

  return (data || []) as SecurityGroup[];
}

/**
 * Get security group members.
 */
export async function getSecurityGroupMembers(
  admin: SupabaseClient,
  groupId: string,
  activeOnly: boolean = true,
): Promise<SecurityGroupMember[]> {
  let query = admin.from("security_group_members").select("*").eq("security_group_id", groupId);

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query.order("assigned_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch group members:", error);
    return [];
  }

  return (data || []) as SecurityGroupMember[];
}

export async function getSecurityGroupMemberById(
  admin: SupabaseClient,
  membershipId: string,
  organizationId: string,
): Promise<SecurityGroupMember | null> {
  const { data, error } = await admin
    .from("security_group_members")
    .select("*")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch group member:", error);
    return null;
  }

  return (data as SecurityGroupMember | null) ?? null;
}

export async function countSecurityGroupMembers(
  admin: SupabaseClient,
  groupIds: string[],
): Promise<Map<string, { total: number; active: number }>> {
  const counts = new Map<string, { total: number; active: number }>();
  if (groupIds.length === 0) return counts;

  const { data, error } = await admin
    .from("security_group_members")
    .select("security_group_id, status")
    .in("security_group_id", groupIds);

  if (error) {
    console.error("Failed to count group members:", error);
    return counts;
  }

  for (const row of data ?? []) {
    const groupId = row.security_group_id as string;
    const current = counts.get(groupId) ?? { total: 0, active: 0 };
    current.total += 1;
    if (row.status === "active") current.active += 1;
    counts.set(groupId, current);
  }

  return counts;
}

/**
 * Get security groups a user is a member of, including membership timing.
 */
export async function getUserSecurityGroupMemberships(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<
  Array<{
    group: SecurityGroup;
    membership: SecurityGroupMember;
  }>
> {
  const { data, error } = await admin
    .from("security_group_members")
    .select("*, security_groups(*)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch user security group memberships:", error);
    return [];
  }

  return (data || [])
    .map((item: Record<string, unknown>) => {
      const group = item.security_groups as SecurityGroup | null;
      if (!group || group.organization_id !== organizationId) return null;
      const membership: SecurityGroupMember = {
        id: String(item.id),
        security_group_id: String(item.security_group_id),
        organization_id: (item.organization_id as string | null) ?? null,
        user_id: String(item.user_id),
        campus_id: (item.campus_id as string | null) ?? null,
        scope_type: (item.scope_type as SecurityGroupMember["scope_type"]) ?? undefined,
        effective_at: (item.effective_at as string | null) ?? null,
        expires_at: (item.expires_at as string | null) ?? null,
        status: item.status as SecurityGroupMember["status"],
        assignment_reason: (item.assignment_reason as string | null) ?? null,
        administrative_notes: (item.administrative_notes as string | null) ?? null,
        assigned_by: String(item.assigned_by),
        assigned_at: String(item.assigned_at),
        updated_by: (item.updated_by as string | null) ?? null,
        updated_at: (item.updated_at as string | null) ?? null,
        removed_by: (item.removed_by as string | null) ?? null,
        removed_at: (item.removed_at as string | null) ?? null,
        revocation_reason: (item.revocation_reason as string | null) ?? null,
      };
      return { group, membership };
    })
    .filter(
      (
        row,
      ): row is {
        group: SecurityGroup;
        membership: SecurityGroupMember;
      } => Boolean(row),
    );
}

/**
 * Get security groups a user is a member of.
 */
export async function getUserSecurityGroups(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<SecurityGroup[]> {
  const rows = await getUserSecurityGroupMemberships(admin, userId, organizationId);
  return rows.map((row) => row.group);
}

/**
 * List holders of a permission within a church (direct + via security groups).
 */
export async function listPermissionGrantHolders(
  admin: SupabaseClient,
  organizationId: string,
  permissionDefinitionId: string,
): Promise<{
  direct: Array<{
    userId: string;
    effect: string;
    status: string;
    expiresAt: string | null;
    assignedAt: string;
    reason: string | null;
  }>;
  groups: Array<{
    groupId: string;
    groupName: string;
    effect: string;
    expiresAt: string | null;
    members: Array<{
      userId: string;
      membershipExpiresAt: string | null;
      membershipStatus: string;
    }>;
  }>;
}> {
  const [{ data: directRows, error: directError }, { data: groupPermRows, error: groupPermError }] =
    await Promise.all([
      admin
        .from("user_permissions")
        .select(
          "user_id, permission_effect, status, expires_at, assigned_at, reason",
        )
        .eq("organization_id", organizationId)
        .eq("permission_definition_id", permissionDefinitionId)
        .neq("status", "revoked"),
      admin
        .from("security_group_permissions")
        .select(
          "security_group_id, permission_effect, expires_at, security_groups!inner(id, name, organization_id, status)",
        )
        .eq("permission_definition_id", permissionDefinitionId),
    ]);

  if (directError) {
    console.error("Failed to list direct permission holders:", directError);
  }
  if (groupPermError) {
    console.error("Failed to list group permission holders:", groupPermError);
  }

  const direct = ((directRows ?? []) as Array<{
    user_id: string;
    permission_effect: string;
    status: string;
    expires_at: string | null;
    assigned_at: string;
    reason: string | null;
  }>).map((row) => ({
    userId: row.user_id,
    effect: row.permission_effect,
    status: row.status,
    expiresAt: row.expires_at,
    assignedAt: row.assigned_at,
    reason: row.reason,
  }));

  const churchGroups = ((groupPermRows ?? []) as Array<{
    security_group_id: string;
    permission_effect: string;
    expires_at: string | null;
    security_groups:
      | {
          id: string;
          name: string;
          organization_id: string;
          status: string;
        }
      | {
          id: string;
          name: string;
          organization_id: string;
          status: string;
        }[]
      | null;
  }>)
    .map((row) => {
      const group = Array.isArray(row.security_groups)
        ? row.security_groups[0]
        : row.security_groups;
      if (!group || group.organization_id !== organizationId || group.status !== "active") {
        return null;
      }
      return {
        groupId: group.id,
        groupName: group.name,
        effect: row.permission_effect,
        expiresAt: row.expires_at,
      };
    })
    .filter(
      (
        row,
      ): row is {
        groupId: string;
        groupName: string;
        effect: string;
        expiresAt: string | null;
      } => Boolean(row),
    );

  const groups = await Promise.all(
    churchGroups.map(async (group) => {
      const members = await getSecurityGroupMembers(admin, group.groupId, true);
      return {
        ...group,
        members: members.map((member) => ({
          userId: member.user_id,
          membershipExpiresAt: member.expires_at,
          membershipStatus: member.status,
        })),
      };
    }),
  );

  return { direct, groups };
}

/**
 * Get permissions for a security group.
 */
export async function getSecurityGroupPermissions(
  admin: SupabaseClient,
  groupId: string,
): Promise<SecurityGroupPermission[]> {
  const { data, error } = await admin
    .from("security_group_permissions")
    .select("*")
    .eq("security_group_id", groupId);

  if (error) {
    console.error("Failed to fetch group permissions:", error);
    return [];
  }

  return (data || []) as SecurityGroupPermission[];
}

/**
 * Get direct user permissions for a church.
 */
export async function getUserDirectPermissions(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<UserPermission[]> {
  const { data, error } = await admin
    .from("user_permissions")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .neq("status", "revoked");

  if (error) {
    console.error("Failed to fetch user permissions:", error);
    return [];
  }

  return (data || []) as UserPermission[];
}

/**
 * Get a permission definition by key.
 */
export async function getPermissionDefinitionByKey(
  admin: SupabaseClient,
  permissionKey: string,
): Promise<PermissionDefinition | null> {
  const { data, error } = await admin
    .from("permission_definitions")
    .select("*")
    .eq("permission_key", permissionKey)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch permission definition:", error);
    return null;
  }

  return data as PermissionDefinition | null;
}

/**
 * Get all permission definitions for a category.
 */
export async function listPermissionsByCategory(
  admin: SupabaseClient,
  category: string,
): Promise<PermissionDefinition[]> {
  const { data, error } = await admin
    .from("permission_definitions")
    .select("*")
    .eq("category", category)
    .eq("active", true);

  if (error) {
    console.error("Failed to list permissions:", error);
    return [];
  }

  return (data || []) as PermissionDefinition[];
}

/**
 * Get all active permission definitions.
 */
export async function listAllPermissions(admin: SupabaseClient): Promise<PermissionDefinition[]> {
  const { data, error } = await admin
    .from("permission_definitions")
    .select("*")
    .eq("active", true);

  if (error) {
    console.error("Failed to list all permissions:", error);
    return [];
  }

  return (data || []) as PermissionDefinition[];
}

/**
 * Create a new security group.
 */
export async function createSecurityGroup(
  admin: SupabaseClient,
  organizationId: string,
  name: string,
  description: string | null,
  createdBy: string,
): Promise<SecurityGroup | null> {
  const { data, error } = await admin
    .from("security_groups")
    .insert({
      organization_id: organizationId,
      name,
      description,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select();

  if (error) {
    console.error("Failed to create security group:", error);
    return null;
  }

  return (data?.[0] as unknown as SecurityGroup) || null;
}

/**
 * Update a security group.
 */
export async function updateSecurityGroup(
  admin: SupabaseClient,
  groupId: string,
  updates: Partial<Pick<SecurityGroup, "name" | "description" | "status" | "notes">>,
  updatedBy: string,
): Promise<SecurityGroup | null> {
  const { data, error } = await admin
    .from("security_groups")
    .update({
      ...updates,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .select();

  if (error) {
    console.error("Failed to update security group:", error);
    return null;
  }

  return (data?.[0] as unknown as SecurityGroup) || null;
}

/**
 * Add a user to a security group.
 */
export async function addUserToSecurityGroup(
  admin: SupabaseClient,
  groupId: string,
  userId: string,
  assignedBy: string,
  options?: {
    organizationId?: string;
    effectiveAt?: string | null;
    expiresAt?: string | null;
    campusId?: string | null;
    scopeType?: string;
    assignmentReason?: string | null;
    administrativeNotes?: string | null;
  },
): Promise<SecurityGroupMember | null> {
  const { data, error } = await admin
    .from("security_group_members")
    .insert({
      security_group_id: groupId,
      user_id: userId,
      assigned_by: assignedBy,
      organization_id: options?.organizationId ?? null,
      effective_at: options?.effectiveAt ?? null,
      expires_at: options?.expiresAt ?? null,
      campus_id: options?.campusId ?? null,
      scope_type: options?.scopeType ?? "all_current_future_campuses",
      assignment_reason: options?.assignmentReason ?? null,
      administrative_notes: options?.administrativeNotes ?? null,
    })
    .select();

  if (error) {
    console.error("Failed to add user to group:", error);
    return null;
  }

  return (data?.[0] as unknown as SecurityGroupMember) || null;
}

/**
 * Remove a user from a security group.
 */
export async function removeUserFromSecurityGroup(
  admin: SupabaseClient,
  memberId: string,
  removedBy: string,
  revocationReason?: string | null,
): Promise<boolean> {
  const { error } = await admin
    .from("security_group_members")
    .update({
      status: "revoked",
      removed_by: removedBy,
      removed_at: new Date().toISOString(),
      revocation_reason: revocationReason ?? null,
      updated_by: removedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId);

  if (error) {
    console.error("Failed to remove user from group:", error);
    return false;
  }

  return true;
}

export async function updateSecurityGroupMember(
  admin: SupabaseClient,
  memberId: string,
  organizationId: string,
  updates: {
    effectiveAt?: string | null;
    expiresAt?: string | null;
    campusId?: string | null;
    scopeType?: string;
    assignmentReason?: string | null;
    administrativeNotes?: string | null;
  },
  updatedBy: string,
): Promise<SecurityGroupMember | null> {
  const payload: Record<string, unknown> = {
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  if (updates.effectiveAt !== undefined) payload.effective_at = updates.effectiveAt;
  if (updates.expiresAt !== undefined) payload.expires_at = updates.expiresAt;
  if (updates.campusId !== undefined) payload.campus_id = updates.campusId;
  if (updates.scopeType !== undefined) payload.scope_type = updates.scopeType;
  if (updates.assignmentReason !== undefined) {
    payload.assignment_reason = updates.assignmentReason;
  }
  if (updates.administrativeNotes !== undefined) {
    payload.administrative_notes = updates.administrativeNotes;
  }

  const { data, error } = await admin
    .from("security_group_members")
    .update(payload)
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Failed to update group member:", error);
    return null;
  }

  return (data as SecurityGroupMember | null) ?? null;
}

/**
 * Add a permission to a security group.
 */
export async function addPermissionToSecurityGroup(
  admin: SupabaseClient,
  groupId: string,
  permissionDefinitionId: string,
  assignedBy: string,
  scopeType: string = "all_current_future_campuses",
  campusId?: string | null,
  effectiveAt?: string | null,
  expiresAt?: string | null,
  reason?: string | null,
): Promise<SecurityGroupPermission | null> {
  const { data, error } = await admin
    .from("security_group_permissions")
    .insert({
      security_group_id: groupId,
      permission_definition_id: permissionDefinitionId,
      permission_effect: "grant",
      scope_type: scopeType,
      campus_id: campusId || null,
      effective_at: effectiveAt || null,
      expires_at: expiresAt || null,
      assigned_by: assignedBy,
      reason: reason || null,
    })
    .select();

  if (error) {
    console.error("Failed to add permission to group:", error);
    return null;
  }

  return (data?.[0] as unknown as SecurityGroupPermission) || null;
}

/**
 * Remove a permission from a security group.
 */
export async function removePermissionFromSecurityGroup(
  admin: SupabaseClient,
  permissionId: string,
): Promise<boolean> {
  const { error } = await admin.from("security_group_permissions").delete().eq("id", permissionId);

  if (error) {
    console.error("Failed to remove permission from group:", error);
    return false;
  }

  return true;
}

/**
 * Grant a direct user permission.
 */
export async function grantUserPermission(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  permissionDefinitionId: string,
  assignedBy: string,
  scopeType: string = "all_current_future_campuses",
  campusId?: string | null,
  effectiveAt?: string | null,
  expiresAt?: string | null,
  reason?: string | null,
  notes?: string | null,
): Promise<UserPermission | null> {
  const { data, error } = await admin
    .from("user_permissions")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      permission_definition_id: permissionDefinitionId,
      permission_effect: "grant",
      scope_type: scopeType,
      campus_id: campusId || null,
      effective_at: effectiveAt || null,
      expires_at: expiresAt || null,
      assigned_by: assignedBy,
      reason: reason || null,
      notes: notes || null,
    })
    .select();

  if (error) {
    console.error("Failed to grant user permission:", error);
    return null;
  }

  return (data?.[0] as unknown as UserPermission) || null;
}

/**
 * Deny a direct user permission.
 */
export async function denyUserPermission(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  permissionDefinitionId: string,
  assignedBy: string,
  scopeType: string = "all_current_future_campuses",
  campusId?: string | null,
  effectiveAt?: string | null,
  expiresAt?: string | null,
  reason?: string | null,
  notes?: string | null,
): Promise<UserPermission | null> {
  const { data, error } = await admin
    .from("user_permissions")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      permission_definition_id: permissionDefinitionId,
      permission_effect: "deny",
      scope_type: scopeType,
      campus_id: campusId || null,
      effective_at: effectiveAt || null,
      expires_at: expiresAt || null,
      assigned_by: assignedBy,
      reason: reason || null,
      notes: notes || null,
    })
    .select();

  if (error) {
    console.error("Failed to deny user permission:", error);
    return null;
  }

  return (data?.[0] as unknown as UserPermission) || null;
}

/**
 * Update a direct user permission (dates, reason, permission, effect).
 * Status is recalculated by the DB expiry trigger (except revoked).
 */
export async function updateUserPermission(
  admin: SupabaseClient,
  permissionId: string,
  updates: {
    permissionDefinitionId?: string;
    permissionEffect?: "grant" | "deny";
    effectiveAt?: string | null;
    expiresAt?: string | null;
    reason?: string | null;
    notes?: string | null;
  },
): Promise<UserPermission | null> {
  const payload: Record<string, unknown> = {};
  if (updates.permissionDefinitionId !== undefined) {
    payload.permission_definition_id = updates.permissionDefinitionId;
  }
  if (updates.permissionEffect !== undefined) {
    payload.permission_effect = updates.permissionEffect;
  }
  if (updates.effectiveAt !== undefined) {
    payload.effective_at = updates.effectiveAt;
  }
  if (updates.expiresAt !== undefined) {
    payload.expires_at = updates.expiresAt;
  }
  if (updates.reason !== undefined) {
    payload.reason = updates.reason;
  }
  if (updates.notes !== undefined) {
    payload.notes = updates.notes;
  }

  if (Object.keys(payload).length === 0) {
    return null;
  }

  const { data, error } = await admin
    .from("user_permissions")
    .update(payload)
    .eq("id", permissionId)
    .neq("status", "revoked")
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("Failed to update user permission:", error);
    return null;
  }

  return (data as UserPermission | null) ?? null;
}

/**
 * Load one user permission by id (church-scoped).
 */
export async function getUserPermissionById(
  admin: SupabaseClient,
  permissionId: string,
  organizationId: string,
): Promise<UserPermission | null> {
  const { data, error } = await admin
    .from("user_permissions")
    .select("*")
    .eq("id", permissionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Failed to load user permission:", error);
    return null;
  }

  return (data as UserPermission | null) ?? null;
}

/**
 * Revoke a user permission.
 */
export async function revokeUserPermission(
  admin: SupabaseClient,
  permissionId: string,
  revokedBy: string,
): Promise<boolean> {
  const { error } = await admin
    .from("user_permissions")
    .update({
      status: "revoked",
      revoked_by: revokedBy,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", permissionId);

  if (error) {
    console.error("Failed to revoke user permission:", error);
    return false;
  }

  return true;
}

/**
 * List all non-revoked user permissions for a church (optionally temporary-only).
 */
export async function listChurchUserPermissions(
  admin: SupabaseClient,
  organizationId: string,
  options?: { temporaryOnly?: boolean },
): Promise<UserPermission[]> {
  let query = admin
    .from("user_permissions")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "revoked")
    .order("assigned_at", { ascending: false });

  if (options?.temporaryOnly) {
    query = query.not("expires_at", "is", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to list church user permissions:", error);
    return [];
  }

  return (data || []) as UserPermission[];
}

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
  churchId: string,
  activeOnly: boolean = true,
): Promise<SecurityGroup[]> {
  let query = admin.from("security_groups").select("*").eq("church_id", churchId);

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

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch group members:", error);
    return [];
  }

  return (data || []) as SecurityGroupMember[];
}

/**
 * Get security groups a user is a member of.
 */
export async function getUserSecurityGroups(
  admin: SupabaseClient,
  userId: string,
  churchId: string,
): Promise<SecurityGroup[]> {
  const { data, error } = await admin
    .from("security_group_members")
    .select("security_groups(*)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch user security groups:", error);
    return [];
  }

  return (data || [])
    .map((item: any) => item.security_groups)
    .filter((group: SecurityGroup | null) => group && group.church_id === churchId) as SecurityGroup[];
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
  churchId: string,
): Promise<UserPermission[]> {
  const { data, error } = await admin
    .from("user_permissions")
    .select("*")
    .eq("user_id", userId)
    .eq("church_id", churchId)
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
  churchId: string,
  name: string,
  description: string | null,
  createdBy: string,
): Promise<SecurityGroup | null> {
  const { data, error } = await admin
    .from("security_groups")
    .insert({
      church_id: churchId,
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
  effectiveAt?: string,
  expiresAt?: string,
): Promise<SecurityGroupMember | null> {
  const { data, error } = await admin
    .from("security_group_members")
    .insert({
      security_group_id: groupId,
      user_id: userId,
      assigned_by: assignedBy,
      effective_at: effectiveAt || null,
      expires_at: expiresAt || null,
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
): Promise<boolean> {
  const { error } = await admin
    .from("security_group_members")
    .update({
      status: "revoked",
      removed_by: removedBy,
      removed_at: new Date().toISOString(),
    })
    .eq("id", memberId);

  if (error) {
    console.error("Failed to remove user from group:", error);
    return false;
  }

  return true;
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
  churchId: string,
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
      church_id: churchId,
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
  churchId: string,
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
      church_id: churchId,
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
  churchId: string,
  options?: { temporaryOnly?: boolean },
): Promise<UserPermission[]> {
  let query = admin
    .from("user_permissions")
    .select("*")
    .eq("church_id", churchId)
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

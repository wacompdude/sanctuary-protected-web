/**
 * lib/security/authorization.ts
 *
 * Core authorization service: evaluates whether a user can perform an action.
 * This is the centralized permission evaluation engine for the application.
 *
 * Authorization Rules (Precedence):
 * 1. User must be active
 * 2. Church must be active
 * 3. Feature must be available under subscription tier
 * 4. Permission must be within temporal range (effective/expiration)
 * 5. User must have church membership
 * 6. Campus scope must be satisfied (if applicable)
 * 7. Explicit user DENY overrides all grants (highest priority exception)
 * 8. Grants are evaluated as OR (any single grant allows access)
 * 9. Default is DENY (no grant = denied)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type {
  AuthorizationRequest,
  AuthorizationResult,
  AuthorizationReason,
  PermissionSource,
  PermissionGrant,
  PermissionDefinition,
  UserPermission,
  SecurityGroupPermission,
} from "./types";
import { ROLE_PERMISSION_MAPPING, unionRolePermissions } from "./permission-keys";
import { featureKeyForPermission } from "@/lib/security/permission-features";
import { hasFeature } from "@/lib/subscriptions/resolver";
import {
  isCampusInScope,
  mergeGroupPermissionScope,
} from "@/lib/security/campus-scope";

/**
 * Local helper: get a church by ID.
 */
async function getChurch(admin: SupabaseClient, organizationId: string) {
  const { data } = await admin.from("organizations").select("id, status").eq("id", organizationId).maybeSingle();
  return data;
}

/**
 * Local helper: get a church membership.
 */
async function getChurchMembership(admin: SupabaseClient, userId: string, organizationId: string) {
  const { data } = await admin
    .from("organization_memberships")
    .select("id, user_id, organization_id, role, status")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

/**
 * Active church roles for a membership (primary + secondary).
 * Falls back to the membership.role column when junction rows are unavailable.
 */
async function getActiveMembershipRoles(
  admin: SupabaseClient,
  membershipId: string,
  fallbackRole: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("organization_membership_roles")
    .select("role")
    .eq("organization_membership_id", membershipId)
    .eq("status", "active");

  if (error || !data?.length) {
    return [fallbackRole];
  }

  return [...new Set(data.map((row: { role: string }) => row.role).filter(Boolean))];
}

/**
 * Check if a permission grant is active at a given date.
 * Returns true if:
 * - effective_at is null or <= actionDate
 * - expires_at is null or >= actionDate
 */
function isPermissionActive(grant: PermissionGrant | UserPermission | SecurityGroupPermission, actionDate: Date): boolean {
  if (grant.effective_at) {
    const effectiveDate = new Date(grant.effective_at);
    if (effectiveDate > actionDate) return false;
  }

  if (grant.expires_at) {
    const expiresDate = new Date(grant.expires_at);
    if (expiresDate < actionDate) return false;
  }

  return true;
}

/**
 * Get role-based permissions for one or more church roles (union / dedupe).
 */
function getRolePermissions(roles: string[], permissionKey: string): PermissionGrant[] {
  const rolePerms = unionRolePermissions(roles);

  if (!rolePerms.includes(permissionKey as any)) {
    return [];
  }

  const matchedRoles = roles.filter((role) =>
    (ROLE_PERMISSION_MAPPING[role] ?? []).includes(permissionKey as any),
  );

  return matchedRoles.map((role) => ({
    id: `role-${role}-${permissionKey}`,
    permission_key: permissionKey,
    permission_effect: "grant" as const,
    scope_type: "all_current_future_campuses" as const,
    campus_id: null,
    effective_at: null,
    expires_at: null,
    source: "ROLE" as const,
  }));
}

/**
 * Get group-based permissions for a user.
 * Returns all permissions granted via security groups the user is a member of.
 */
async function getGroupPermissions(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  permissionKey: string,
  actionDate: Date,
): Promise<PermissionGrant[]> {
  // Query: user's active security group memberships
  const { data: memberships, error: memberError } = await admin
    .from("security_group_members")
    .select(`
      security_group_id,
      effective_at,
      expires_at,
      status,
      campus_id,
      scope_type
    `)
    .eq("user_id", userId)
    .eq("status", "active");

  if (memberError || !memberships?.length) {
    return [];
  }

  // Get permission definitions for those groups
  const groupIds = memberships.map((m: any) => m.security_group_id);

  const { data: groupPerms, error: permError } = await admin
    .from("security_group_permissions")
    .select(
      `
      id,
      security_group_id,
      permission_definition_id,
      permissions_definition:permission_definition_id(permission_key),
      permission_effect,
      scope_type,
      campus_id,
      effective_at,
      expires_at
    `,
    )
    .in("security_group_id", groupIds)
    .eq("permission_effect", "grant");

  if (permError || !groupPerms?.length) {
    return [];
  }

  // Match permissions to the requested key
  const grants: PermissionGrant[] = [];

  for (const perm of groupPerms) {
    const permDef = (perm as any).permissions_definition;
    if (permDef?.permission_key !== permissionKey) continue;

    // Check if this group membership is active at actionDate
    const membership = memberships.find((m: any) => m.security_group_id === perm.security_group_id);
    if (membership) {
      if (membership.effective_at) {
        const effectiveDate = new Date(membership.effective_at);
        if (effectiveDate > actionDate) continue;
      }
      if (membership.expires_at) {
        const expiresDate = new Date(membership.expires_at);
        if (expiresDate < actionDate) continue;
      }
    }

    // Check if the permission itself is active
    if (!isPermissionActive(perm as any, actionDate)) continue;

    const scoped = mergeGroupPermissionScope({
      permissionScopeType: perm.scope_type,
      permissionCampusId: perm.campus_id,
      membershipScopeType: membership?.scope_type ?? null,
      membershipCampusId: membership?.campus_id ?? null,
    });

    grants.push({
      id: perm.id,
      permission_key: permissionKey,
      permission_effect: perm.permission_effect,
      scope_type: scoped.scope_type,
      campus_id: scoped.campus_id,
      effective_at: perm.effective_at,
      expires_at: perm.expires_at,
      source: "GROUP",
      groupId: perm.security_group_id,
    });
  }

  return grants;
}

/**
 * Get direct user permissions.
 * Returns permissions granted or denied directly to the user.
 */
async function getUserDirectPermissions(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  permissionKey: string,
  effect: "grant" | "deny",
): Promise<UserPermission | null> {
  const { data, error } = await admin
    .from("user_permissions")
    .select("*")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("permission_effect", effect)
    .neq("status", "revoked")
    .maybeSingle();

  if (error || !data) return null;

  // Match by permission key
  const { data: permDef } = await admin
    .from("permission_definitions")
    .select("id")
    .eq("permission_key", permissionKey)
    .maybeSingle();

  if (!permDef || data.permission_definition_id !== permDef.id) return null;

  return data as UserPermission;
}

/**
 * Main authorization function: determines if a user can perform an action.
 *
 * @param admin Supabase admin client (service role)
 * @param request Authorization request parameters
 * @returns Authorization result with reason and details
 */
export async function canUserPerform(
  admin: SupabaseClient,
  request: AuthorizationRequest,
): Promise<AuthorizationResult> {
  const { userId, organizationId, campusId, permissionKey, resourceId, actionDate = new Date() } = request;

  try {
    // 1. Check user is active
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    if (!authUser || (authUser.user as any)?.user_metadata?.disabled) {
      return {
        allowed: false,
        reason: "USER_INACTIVE",
        message: "Your account is not active.",
      };
    }

    // 2. Check church is active
    const church = await getChurch(admin, organizationId);
    if (!church || church.status !== "active") {
      return {
        allowed: false,
        reason: "CHURCH_INACTIVE",
        message: "The church organization is not active.",
      };
    }

    // 3. Check user is a member of the church
    const membership = await getChurchMembership(admin, userId, organizationId);
    if (!membership || membership.status !== "active") {
      return {
        allowed: false,
        reason: "PERMISSION_NOT_GRANTED",
        message: "You do not have access to this church.",
      };
    }

    // 4. Get permission definition
    const { data: permissionDef } = await admin
      .from("permission_definitions")
      .select("*")
      .eq("permission_key", permissionKey)
      .maybeSingle();

    if (!permissionDef || !permissionDef.active) {
      return {
        allowed: false,
        reason: "PERMISSION_NOT_GRANTED",
        message: "This permission does not exist.",
      };
    }

    // 5. Check feature catalog availability for this permission.
    const featureKey = featureKeyForPermission(permissionDef.permission_key);
    if (featureKey) {
      const canUseFeature = await hasFeature({
        organizationId,
        featureKey,
      });
      if (!canUseFeature.allowed) {
        return {
          allowed: false,
          reason: "TIER_FEATURE_UNAVAILABLE",
          message:
            canUseFeature.reason ??
            "This feature is not available under your current subscription plan.",
        };
      }
    }

    // 6. Check explicit user-level DENY (highest priority exception)
    const userDeny = await getUserDirectPermissions(admin, userId, organizationId, permissionKey, "deny");
    if (userDeny && isPermissionActive(userDeny, actionDate)) {
      if (!campusId || isCampusInScope(userDeny, campusId)) {
        return {
          allowed: false,
          reason: "EXPLICIT_USER_DENY",
          source: "DIRECT",
          message: `You have been explicitly denied access to this feature${userDeny.reason ? ": " + userDeny.reason : "."}`,
          denialDetails: {
            deniedBy: "USER",
            reason: userDeny.reason || undefined,
          },
        };
      }
    }

    // 7. Collect all potential grants (role-based, group-based, direct)
    const grants: PermissionGrant[] = [];

    // 7a. Role-based grants (primary + secondary union)
    const membershipRoles = await getActiveMembershipRoles(
      admin,
      membership.id,
      membership.role,
    );
    const roleGrants = getRolePermissions(membershipRoles, permissionKey);
    grants.push(...roleGrants);

    // 7b. Group-based grants
    const groupGrants = await getGroupPermissions(admin, userId, organizationId, permissionKey, actionDate);
    grants.push(...groupGrants);

    // 7c. Direct user grants
    const directGrant = await getUserDirectPermissions(admin, userId, organizationId, permissionKey, "grant");
    if (directGrant) {
      grants.push({
        id: directGrant.id,
        permission_key: permissionKey,
        permission_effect: directGrant.permission_effect,
        scope_type: directGrant.scope_type,
        campus_id: directGrant.campus_id,
        effective_at: directGrant.effective_at,
        expires_at: directGrant.expires_at,
        source: "DIRECT",
      });
    }

    // 8. Filter grants by temporal validity
    const activeGrants = grants.filter((g) => isPermissionActive(g, actionDate));

    if (activeGrants.length === 0) {
      return {
        allowed: false,
        reason: "PERMISSION_NOT_GRANTED",
        message: "You do not have permission to perform this action.",
      };
    }

    // 9. Check campus scope (if specified)
    if (campusId) {
      const campusAccessible = activeGrants.some((g) => isCampusInScope(g, campusId));
      if (!campusAccessible) {
        return {
          allowed: false,
          reason: "CAMPUS_ACCESS_DENIED",
          message: `You do not have permission to access this campus.`,
        };
      }
    }

    // 10. Determine expiration from the earliest expiring grant
    const expiresAt = activeGrants.reduce((earliest: Date | undefined, grant) => {
      if (!grant.expires_at) return earliest;
      const grantExpires = new Date(grant.expires_at);
      return !earliest || grantExpires < earliest ? grantExpires : earliest;
    }, undefined);

    return {
      allowed: true,
      reason: "USER_ACTIVE",
      source: activeGrants[0].source || "ROLE",
      message: "You have permission to perform this action.",
      expiresAt,
    };
  } catch (error) {
    console.error("Authorization check error:", error);
    return {
      allowed: false,
      reason: "PERMISSION_NOT_GRANTED",
      message: "An error occurred while checking authorization.",
    };
  }
}

/**
 * Simplified authorization check: returns true/false only.
 * For use in guards and early returns.
 */
export async function isUserAuthorized(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  permissionKey: string,
  campusId?: string,
): Promise<boolean> {
  const result = await canUserPerform(admin, {
    userId,
    organizationId,
    campusId,
    permissionKey,
  });

  return result.allowed;
}

/**
 * Require authorization: throws an error if not authorized.
 * For use in server actions and API routes.
 */
export async function requirePermission(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  permissionKey: string,
  campusId?: string,
): Promise<void> {
  const result = await canUserPerform(admin, {
    userId,
    organizationId,
    campusId,
    permissionKey,
  });

  if (!result.allowed) {
    throw new Error(`Authorization denied: ${result.message}`);
  }
}

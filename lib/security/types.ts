/**
 * lib/security/types.ts
 *
 * Type definitions for the security permissions and access-control system.
 */

import type { MembershipRole as ChurchMembershipRole } from "@/lib/church/types";

/** @deprecated Prefer MembershipRole from @/lib/church/types */
export type MembershipRole = ChurchMembershipRole;

export type PermissionEffect = "grant" | "deny";

export type PermissionScopeType =
  | "all_current_future_campuses"
  | "all_current_campuses"
  | "selected_campuses"
  | "primary_campus"
  | "no_restriction";

export type PermissionRiskLevel = "low" | "medium" | "high";

export type UserPermissionStatus = "active" | "scheduled" | "expired" | "revoked";

export type SecurityGroupStatus = "active" | "inactive";

export type SecurityGroupMemberStatus = "active" | "expired" | "revoked";

export type SecurityAuditEventType =
  | "security_group.created"
  | "security_group.updated"
  | "security_group.deactivated"
  | "security_group.deleted"
  | "security_group_member.added"
  | "security_group_member.removed"
  | "security_group_member.expired"
  | "user_permission.granted"
  | "user_permission.denied"
  | "user_permission.revoked"
  | "user_permission.updated"
  | "user_permission.expired"
  | "security_audit_log.viewed"
  | "security.preview_access_used"
  | "tier.changed"
  | "tier.downgrade"
  | "role.created"
  | "role.updated"
  | "role.deactivated"
  | "membership_role.assigned"
  | "membership_role.removed"
  | "membership_role.primary_changed"
  | "membership.status_changed"
  | "campus_assignment.changed"
  | "permission_override.changed";

export type ChurchMembershipRoleStatus = "active" | "removed";

export type RoleTemplateKind = "church" | "campus";

export interface ChurchMembershipRoleRow {
  id: string;
  organization_id: string;
  organization_membership_id: string;
  user_id: string;
  role: MembershipRole;
  is_primary: boolean;
  status: ChurchMembershipRoleStatus;
  assigned_by: string | null;
  assigned_at: string;
  removed_by: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RolePermissionTemplate {
  id: string;
  role_kind: RoleTemplateKind;
  role_key: string;
  permission_key: string;
  created_at: string;
}

export type SecurityAuditResult = "success" | "failure";

/**
 * Permission definitions from the catalog.
 */
export interface PermissionDefinition {
  id: string;
  permission_key: string;
  category: string;
  display_name: string;
  description: string | null;
  risk_level: PermissionRiskLevel;
  minimum_tier: string;
  supports_campus_scope: boolean;
  supports_resource_scope: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Security groups.
 */
export interface SecurityGroup {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: SecurityGroupStatus;
  effective_at: string | null;
  expires_at: string | null;
  system_template: boolean;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  notes: string | null;
}

/**
 * Security group members.
 */
export interface SecurityGroupMember {
  id: string;
  security_group_id: string;
  user_id: string;
  effective_at: string | null;
  expires_at: string | null;
  status: SecurityGroupMemberStatus;
  assigned_by: string;
  assigned_at: string;
  removed_by: string | null;
  removed_at: string | null;
}

/**
 * Security group permissions (group → permission bindings).
 */
export interface SecurityGroupPermission {
  id: string;
  security_group_id: string;
  permission_definition_id: string;
  permission_effect: PermissionEffect;
  scope_type: PermissionScopeType;
  campus_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  effective_at: string | null;
  expires_at: string | null;
  assigned_by: string;
  assigned_at: string;
  reason: string | null;
}

/**
 * User permissions (direct user → permission bindings).
 */
export interface UserPermission {
  id: string;
  organization_id: string;
  user_id: string;
  permission_definition_id: string;
  permission_effect: PermissionEffect;
  scope_type: PermissionScopeType;
  campus_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  effective_at: string | null;
  expires_at: string | null;
  status: UserPermissionStatus;
  assigned_by: string;
  assigned_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  reason: string | null;
  notes: string | null;
}

/**
 * Security audit log entry.
 */
export interface SecurityAuditLog {
  id: string;
  organization_id: string;
  campus_id: string | null;
  actor_user_id: string;
  target_user_id: string | null;
  security_group_id: string | null;
  permission_definition_id: string | null;
  event_type: SecurityAuditEventType;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  result: SecurityAuditResult;
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Authorization request parameters.
 */
export interface AuthorizationRequest {
  userId: string;
  organizationId: string;
  campusId?: string | null;
  permissionKey: string;
  resourceId?: string | null;
  actionDate?: Date;
}

/**
 * Authorization result returned by canUserPerform().
 */
export type AuthorizationReason =
  | "USER_ACTIVE"
  | "USER_INACTIVE"
  | "CHURCH_INACTIVE"
  | "TIER_FEATURE_UNAVAILABLE"
  | "PERMISSION_NOT_GRANTED"
  | "PERMISSION_EXPIRED"
  | "PERMISSION_NOT_ACTIVE"
  | "EXPLICIT_USER_DENY"
  | "CAMPUS_ACCESS_DENIED"
  | "RESOURCE_ACCESS_DENIED"
  | "DATA_CLASSIFICATION_DENIED"
  | "GROUP_MEMBERSHIP_EXPIRED";

export type PermissionSource = "ROLE" | "GROUP" | "DIRECT" | "INHERITED";

export interface AuthorizationResult {
  allowed: boolean;
  reason: AuthorizationReason;
  source?: PermissionSource;
  message: string;
  expiresAt?: Date;
  denialDetails?: {
    deniedBy: "USER" | "GROUP" | "TIER";
    groupId?: string;
    reason?: string;
  };
}

/**
 * Permission grant for internal authorization logic.
 */
export interface PermissionGrant {
  id: string;
  permission_key: string;
  permission_effect: PermissionEffect;
  scope_type: PermissionScopeType;
  campus_id: string | null;
  effective_at: string | null;
  expires_at: string | null;
  source: PermissionSource;
  groupId?: string;
  reason?: string;
}

/**
 * Access preview request.
 */
export interface AccessPreviewRequest {
  userId: string;
  organizationId: string;
  permissionKey: string;
  campusId?: string | null;
  resourceId?: string | null;
  previewDate?: Date;
}

/**
 * Access preview result.
 */
export interface AccessPreviewResult {
  allowed: boolean;
  permission: PermissionDefinition;
  user: {
    id: string;
    name: string | null;
  };
  campus?: {
    id: string;
    name: string;
  } | null;
  source?: PermissionSource;
  effectiveDate?: Date;
  expiresAt?: Date;
  tier?: string;
  message: string;
  denialReasons?: string[];
}

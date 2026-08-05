/**
 * lib/security/index.ts
 *
 * Public API for the security permissions and access-control system.
 */

export { PERMISSION_KEYS, ROLE_PERMISSION_MAPPING, CAMPUS_ROLE_PERMISSION_MAPPING, unionRolePermissions, isPermissionKey } from "./permission-keys";
export { getSystemRoleCatalog, getSystemRoleEntry, CHURCH_SYSTEM_ROLE_KEYS } from "./role-catalog";
export {
  listActiveMembershipRolesForUser,
  setMembershipRoles,
  listChurchRoleSettings,
} from "./membership-roles";

export type {
  MembershipRole,
  PermissionEffect,
  PermissionScopeType,
  PermissionRiskLevel,
  UserPermissionStatus,
  SecurityGroupStatus,
  SecurityGroupMemberStatus,
  SecurityAuditEventType,
  SecurityAuditResult,
  PermissionDefinition,
  SecurityGroup,
  SecurityGroupMember,
  SecurityGroupPermission,
  UserPermission,
  SecurityAuditLog,
  AuthorizationRequest,
  AuthorizationResult,
  AuthorizationReason,
  PermissionSource,
  PermissionGrant,
  AccessPreviewRequest,
  AccessPreviewResult,
  ChurchMembershipRoleRow,
  RolePermissionTemplate,
  RoleTemplateKind,
  ChurchMembershipRoleStatus,
} from "./types";

export { canUserPerform, isUserAuthorized, requirePermission } from "./authorization";

export {
  writeSecurityAuditLog,
  querySecurityAuditLogs,
  logSecurityGroupCreated,
  logSecurityGroupUpdated,
  logUserPermissionGranted,
  logUserPermissionDenied,
  logUserPermissionRevoked,
  logUserPermissionUpdated,
  logSecurityGroupMemberAdded,
  logSecurityGroupMemberRemoved,
  logSecurityAuditLogViewed,
  logAccessPreviewUsed,
} from "./audit";

export {
  getSecurityGroup,
  listSecurityGroups,
  getSecurityGroupMembers,
  getUserSecurityGroups,
  getUserSecurityGroupMemberships,
  getSecurityGroupPermissions,
  getUserDirectPermissions,
  getPermissionDefinitionByKey,
  listPermissionsByCategory,
  listAllPermissions,
  createSecurityGroup,
  updateSecurityGroup,
  addUserToSecurityGroup,
  removeUserFromSecurityGroup,
  addPermissionToSecurityGroup,
  removePermissionFromSecurityGroup,
  grantUserPermission,
  denyUserPermission,
  updateUserPermission,
  getUserPermissionById,
  revokeUserPermission,
  listChurchUserPermissions,
  listPermissionGrantHolders,
} from "./repository";


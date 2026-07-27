/**
 * lib/security/index.ts
 *
 * Public API for the security permissions and access-control system.
 */

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
} from "./types";

export { PERMISSION_KEYS, ROLE_PERMISSION_MAPPING, isPermissionKey } from "./permission-keys";

export { canUserPerform, isUserAuthorized, requirePermission } from "./authorization";

export {
  writeSecurityAuditLog,
  querySecurityAuditLogs,
  logSecurityGroupCreated,
  logSecurityGroupUpdated,
  logUserPermissionGranted,
  logUserPermissionDenied,
  logUserPermissionRevoked,
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
  revokeUserPermission,
  listChurchUserPermissions,
} from "./repository";


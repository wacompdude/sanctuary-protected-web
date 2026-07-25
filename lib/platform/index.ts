export type {
  PlatformAccountStatus,
  PlatformAccountType,
  PlatformAccountRecord,
  PlatformRoleRecord,
  PlatformAccountRoleAssignment,
  PlatformContext,
  PlatformAccessSessionType,
  PlatformAccessSessionStatus,
} from "@/lib/platform/types";

export {
  PLATFORM_PERMISSIONS,
  isPlatformPermissionKey,
} from "@/lib/platform/permission-keys";
export type { PlatformPermissionKey } from "@/lib/platform/permission-keys";

export {
  PLATFORM_ROLE_KEYS,
  PLATFORM_ROLE_KEY_LIST,
  PLATFORM_ROLE_DISPLAY_NAMES,
  isPlatformRoleKey,
  canManageSuperAdminRole,
} from "@/lib/platform/role-keys";
export type { PlatformRoleKey } from "@/lib/platform/role-keys";

export { PlatformAccessError } from "@/lib/platform/errors";

export {
  EXPECTED_PLATFORM_ROLE_PERMISSIONS,
  resolvePermissionsFromRoleKeys,
  hasPermissionInSet,
} from "@/lib/platform/expected-matrix";

export {
  platformMigrationHint,
  arePlatformTablesAvailable,
  getPlatformAccountByUserId,
  listActivePlatformRoleAssignments,
  listPermissionsForRoleIds,
  listPlatformRoles,
  requirePlatformAdminClient,
} from "@/lib/platform/queries";

export {
  getPlatformAccount,
  requirePlatformAccount,
  getPlatformRoles,
  getPlatformPermissions,
  hasPlatformPermission,
  requirePlatformSetupComplete,
  isPlatformMfaSatisfied,
  requirePlatformMfa,
  requireRecentPlatformAuthentication,
  requirePlatformPermission,
  requirePlatformConsoleAccess,
  recordPlatformLogin,
} from "@/lib/platform/auth";

export {
  PLATFORM_SETUP_PASSWORD_PATH,
  PLATFORM_SETUP_MFA_PATH,
  PLATFORM_HOME_PATH,
  isPlatformPath,
  isPlatformSetupPath,
  isPlatformPasswordSetupPath,
  isPlatformMfaSetupPath,
} from "@/lib/platform/routes";

export {
  rethrowOrRedirectForPlatformAccess,
} from "@/lib/platform/access-guard";

export { writePlatformAdminAction } from "@/lib/platform/audit";
export type { WritePlatformAdminActionInput } from "@/lib/platform/audit";

export {
  PLATFORM_NAV_SECTIONS,
  filterPlatformNavSections,
} from "@/lib/platform/navigation";
export type {
  PlatformNavLink,
  PlatformNavSection,
} from "@/lib/platform/navigation";

export {
  platformRolesInviterMayAssign,
  isAllowedPlatformInviteRole,
  generatePlatformInvitationToken,
  hashPlatformInvitationToken,
  buildPlatformInvitationUrl,
} from "@/lib/platform/invitations";

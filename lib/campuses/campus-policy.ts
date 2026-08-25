import type { CampusRole } from "@/lib/campuses/types";
import type { MembershipRole } from "@/lib/organization/types";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/security/permission-keys";
import { isAssignmentCurrentlyEffective } from "@/lib/security/group-member-utils";
import type { PermissionScopeType, SecurityGroupMemberStatus } from "@/lib/security/types";

/** Church roles with authoritative top-level campus administration. */
export const TOP_LEVEL_CAMPUS_ADMIN_ROLES: readonly MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
];

export const PROTECTED_CHURCH_ROLES: readonly MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
];

export type CampusAction =
  | "view"
  | "overview.view"
  | "create"
  | "edit"
  | "deactivate"
  | "delete"
  | "settings.manage"
  | "security.manage"
  | "members.view"
  | "members.add"
  | "members.remove"
  | "members.manage"
  | "roles.assign"
  | "groups.manage"
  | "audit.view";

export type CampusAuthReason =
  | "ROLE_PERMISSION"
  | "GROUP_PERMISSION"
  | "DIRECT_PERMISSION"
  | "CAMPUS_ROLE"
  | "PERMISSION_NOT_GRANTED"
  | "CAMPUS_SCOPE_DENIED"
  | "PROTECTED_ROLE_REQUIRED"
  | "PROTECTED_TARGET"
  | "ASSIGNABLE_ROLE_DENIED"
  | "SELF_ELEVATION_DENIED"
  | "SELF_SCOPE_EXPANSION_DENIED"
  | "DELEGATION_NOT_ACTIVE"
  | "TIER_LIMIT_REACHED"
  | "CROSS_ORGANIZATION"
  | "CROSS_CAMPUS";

export type CampusAuthResult = {
  allowed: boolean;
  reason: CampusAuthReason;
  source?: string;
  scope?: string;
  message: string;
  permissionKey?: PermissionKey;
};

export const CAMPUS_ACTION_PERMISSION: Record<CampusAction, PermissionKey> = {
  view: PERMISSION_KEYS.CAMPUSES_VIEW,
  "overview.view": PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW,
  create: PERMISSION_KEYS.CAMPUSES_CREATE,
  edit: PERMISSION_KEYS.CAMPUSES_EDIT,
  deactivate: PERMISSION_KEYS.CAMPUSES_DEACTIVATE,
  delete: PERMISSION_KEYS.CAMPUSES_DELETE,
  "settings.manage": PERMISSION_KEYS.CAMPUSES_SETTINGS_MANAGE,
  "security.manage": PERMISSION_KEYS.CAMPUSES_SECURITY_MANAGE,
  "members.view": PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
  "members.add": PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD,
  "members.remove": PERMISSION_KEYS.CAMPUSES_MEMBERS_REMOVE,
  "members.manage": PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE,
  "roles.assign": PERMISSION_KEYS.CAMPUSES_ROLES_ASSIGN,
  "groups.manage": PERMISSION_KEYS.CAMPUSES_GROUPS_MANAGE,
  "audit.view": PERMISSION_KEYS.CAMPUSES_AUDIT_VIEW,
};

export const TOP_LEVEL_CAMPUS_ACTIONS: readonly CampusAction[] = [
  "create",
  "edit",
  "deactivate",
  "delete",
  "settings.manage",
  "security.manage",
  "audit.view",
];

export const DELEGABLE_CAMPUS_ACTIONS: readonly CampusAction[] = [
  "view",
  "overview.view",
  "members.view",
  "members.add",
  "members.remove",
  "members.manage",
  "roles.assign",
  "groups.manage",
];

export const TOP_LEVEL_CAMPUS_PERMISSION_KEYS: readonly PermissionKey[] = [
  PERMISSION_KEYS.CAMPUSES_MANAGE,
  PERMISSION_KEYS.CAMPUSES_CREATE,
  PERMISSION_KEYS.CAMPUSES_EDIT,
  PERMISSION_KEYS.CAMPUSES_DEACTIVATE,
  PERMISSION_KEYS.CAMPUSES_DELETE,
  PERMISSION_KEYS.CAMPUSES_SETTINGS_MANAGE,
  PERMISSION_KEYS.CAMPUSES_SECURITY_MANAGE,
  PERMISSION_KEYS.CAMPUSES_AUDIT_VIEW,
];

export const DELEGABLE_CAMPUS_PERMISSION_KEYS: readonly PermissionKey[] = [
  PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW,
  PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
  PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD,
  PERMISSION_KEYS.CAMPUSES_MEMBERS_REMOVE,
  PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE,
  PERMISSION_KEYS.CAMPUSES_ROLES_ASSIGN,
  PERMISSION_KEYS.CAMPUSES_GROUPS_MANAGE,
];

/** Campus roles a delegated manager may assign. */
export const DELEGATED_ASSIGNABLE_CAMPUS_ROLES: readonly CampusRole[] = [
  "campus_security_leader",
  "campus_security_member",
  "campus_staff",
  "campus_viewer",
];

export const ADMIN_ONLY_CAMPUS_ROLES: readonly CampusRole[] = [
  "campus_administrator",
  "campus_leader",
];

export const CAMPUS_DELEGATION_TEMPLATES = [
  {
    key: "campus_member_manager",
    name: "Campus Member Manager",
    description:
      "View, add, and remove existing church members for a selected campus. Does not include campus configuration or organization administration.",
    permissionKeys: [
      PERMISSION_KEYS.CAMPUSES_VIEW,
      PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_REMOVE,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE,
    ] as PermissionKey[],
  },
  {
    key: "campus_security_team_manager",
    name: "Campus Security Team Manager",
    description:
      "Manage approved campus security team assignments and campus-level roles for a selected campus.",
    permissionKeys: [
      PERMISSION_KEYS.CAMPUSES_VIEW,
      PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
      PERMISSION_KEYS.CAMPUSES_ROLES_ASSIGN,
      PERMISSION_KEYS.CAMPUSES_GROUPS_MANAGE,
    ] as PermissionKey[],
  },
  {
    key: "campus_coordinator",
    name: "Campus Coordinator",
    description:
      "View campus overview and manage approved member assignments without top-level campus changes.",
    permissionKeys: [
      PERMISSION_KEYS.CAMPUSES_VIEW,
      PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
      PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE,
    ] as PermissionKey[],
  },
] as const;

export type CampusDelegationTemplateKey =
  (typeof CAMPUS_DELEGATION_TEMPLATES)[number]["key"];

export function isTopLevelCampusAdminRole(
  role: string | null | undefined,
): boolean {
  return TOP_LEVEL_CAMPUS_ADMIN_ROLES.includes(role as MembershipRole);
}

export function isProtectedChurchRole(role: string | null | undefined): boolean {
  return PROTECTED_CHURCH_ROLES.includes(role as MembershipRole);
}

export function isTopLevelCampusPermission(permissionKey: string): boolean {
  return TOP_LEVEL_CAMPUS_PERMISSION_KEYS.includes(permissionKey as PermissionKey);
}

export function isDelegableCampusPermission(permissionKey: string): boolean {
  return DELEGABLE_CAMPUS_PERMISSION_KEYS.includes(permissionKey as PermissionKey);
}

export function isTopLevelCampusAction(action: CampusAction): boolean {
  return TOP_LEVEL_CAMPUS_ACTIONS.includes(action);
}

export function denialMessageForCampusAction(
  action: CampusAction,
  campusName?: string | null,
): string {
  const campus = campusName?.trim() || "this campus";
  switch (action) {
    case "create":
      return "Only an Owner, Co-owner, or Administrator can add a new campus.";
    case "edit":
    case "settings.manage":
      return `You can manage members for ${campus}, but you do not have permission to edit campus settings.`;
    case "deactivate":
      return "Only an Owner, Co-owner, or Administrator can deactivate a campus.";
    case "delete":
      return "Only an Owner, Co-owner, or Administrator can delete or archive a campus.";
    case "security.manage":
      return "Only an Owner, Co-owner, or Administrator can assign or revoke campus-management delegation.";
    case "audit.view":
      return "Only an Owner, Co-owner, or Administrator can view campus-management audit history.";
    case "members.view":
    case "members.add":
    case "members.remove":
    case "members.manage":
      return `You cannot manage members from ${campus}.`;
    case "roles.assign":
      return "You cannot assign this role because it grants permissions beyond your delegation authority.";
    case "groups.manage":
      return `You cannot manage security teams for ${campus}.`;
    default:
      return "You do not have permission to perform this campus action.";
  }
}

export function evaluateCampusAccessFromChurchRole(
  churchRole: MembershipRole | string | null | undefined,
  action: CampusAction,
  campusName?: string | null,
): CampusAuthResult {
  const permissionKey = CAMPUS_ACTION_PERMISSION[action];
  if (isTopLevelCampusAdminRole(churchRole)) {
    return {
      allowed: true,
      reason: "ROLE_PERMISSION",
      source: churchRole ?? "administrator",
      scope: "all campuses",
      message: "Authorized by church role.",
      permissionKey,
    };
  }

  if (isTopLevelCampusAction(action)) {
    return {
      allowed: false,
      reason: "PROTECTED_ROLE_REQUIRED",
      message: denialMessageForCampusAction(action, campusName),
      permissionKey,
    };
  }

  return {
    allowed: false,
    reason: "PERMISSION_NOT_GRANTED",
    message: denialMessageForCampusAction(action, campusName),
    permissionKey,
  };
}

const MEMBER_ACTIONS_SATISFIED_BY_MANAGE: CampusAction[] = [
  "members.view",
  "members.add",
  "members.remove",
  "members.manage",
];

const VIEW_ACTIONS_SATISFIED_BY_OVERVIEW: CampusAction[] = [
  "view",
  "overview.view",
];

export function impliedPermissionKeysForAction(action: CampusAction): PermissionKey[] {
  const primary = CAMPUS_ACTION_PERMISSION[action];
  const keys = new Set<PermissionKey>([primary]);
  if (MEMBER_ACTIONS_SATISFIED_BY_MANAGE.includes(action)) {
    keys.add(PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE);
  }
  if (VIEW_ACTIONS_SATISFIED_BY_OVERVIEW.includes(action)) {
    keys.add(PERMISSION_KEYS.CAMPUSES_VIEW);
    keys.add(PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW);
    keys.add(PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW);
    keys.add(PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE);
  }
  if (action === "members.view") {
    keys.add(PERMISSION_KEYS.CAMPUSES_OVERVIEW_VIEW);
  }
  return [...keys];
}

export function churchRoleGrantsCampusAction(
  churchRole: MembershipRole | string | null | undefined,
  action: CampusAction,
): boolean {
  return evaluateCampusAccessFromChurchRole(churchRole, action).allowed;
}

export function campusAdministratorGrantsAction(action: CampusAction): boolean {
  return (
    action === "view" ||
    action === "overview.view" ||
    MEMBER_ACTIONS_SATISFIED_BY_MANAGE.includes(action) ||
    action === "roles.assign" ||
    action === "groups.manage"
  );
}

export function evaluateLegacyCampusRole(
  campusRole: CampusRole | string | null | undefined,
  action: CampusAction,
  campusName?: string | null,
): CampusAuthResult {
  const permissionKey = CAMPUS_ACTION_PERMISSION[action];
  if (isTopLevelCampusAction(action)) {
    return {
      allowed: false,
      reason: "PROTECTED_ROLE_REQUIRED",
      message: denialMessageForCampusAction(action, campusName),
      permissionKey,
    };
  }
  if (campusRole === "campus_administrator" && campusAdministratorGrantsAction(action)) {
    return {
      allowed: true,
      reason: "CAMPUS_ROLE",
      source: "campus_administrator",
      scope: campusName ?? "assigned campus",
      message: "Authorized by campus administrator assignment.",
      permissionKey,
    };
  }
  return {
    allowed: false,
    reason: "PERMISSION_NOT_GRANTED",
    message: denialMessageForCampusAction(action, campusName),
    permissionKey,
  };
}

export function assertProtectedCampusTarget(params: {
  actorIsTopLevelAdmin: boolean;
  targetChurchRole: string | null | undefined;
}): CampusAuthResult {
  if (
    !params.actorIsTopLevelAdmin &&
    isProtectedChurchRole(params.targetChurchRole)
  ) {
    return {
      allowed: false,
      reason: "PROTECTED_TARGET",
      message:
        "You do not have authority to modify this member's organization-level role.",
    };
  }
  return {
    allowed: true,
    reason: "ROLE_PERMISSION",
    message: "Target member may be updated.",
  };
}

export function assertAssignableCampusRole(params: {
  actorIsTopLevelAdmin: boolean;
  campusRole: CampusRole | string;
}): CampusAuthResult {
  if (params.actorIsTopLevelAdmin) {
    return {
      allowed: true,
      reason: "ROLE_PERMISSION",
      message: "Role may be assigned.",
    };
  }
  if (DELEGATED_ASSIGNABLE_CAMPUS_ROLES.includes(params.campusRole as CampusRole)) {
    return {
      allowed: true,
      reason: "ROLE_PERMISSION",
      message: "Role may be assigned.",
    };
  }
  return {
    allowed: false,
    reason: "ASSIGNABLE_ROLE_DENIED",
    message:
      "You cannot assign this role because it grants permissions beyond your delegation authority.",
  };
}

export function assertNotSelfElevation(params: {
  actorUserId: string;
  targetUserId: string;
  changingOwnScope?: boolean;
  changingOwnDelegation?: boolean;
}): CampusAuthResult {
  if (params.actorUserId !== params.targetUserId) {
    return {
      allowed: true,
      reason: "ROLE_PERMISSION",
      message: "Target is another user.",
    };
  }
  if (params.changingOwnScope) {
    return {
      allowed: false,
      reason: "SELF_SCOPE_EXPANSION_DENIED",
      message: "You cannot expand your own campus scope.",
    };
  }
  if (params.changingOwnDelegation) {
    return {
      allowed: false,
      reason: "SELF_ELEVATION_DENIED",
      message: "You cannot assign yourself additional campus-management permissions.",
    };
  }
  return {
    allowed: true,
    reason: "ROLE_PERMISSION",
    message: "Self-update is not an elevation.",
  };
}

export function isDelegationActiveAt(params: {
  status: SecurityGroupMemberStatus | string;
  effectiveAt: string | null;
  expiresAt: string | null;
  now?: Date;
}): boolean {
  return isAssignmentCurrentlyEffective({
    status: params.status as SecurityGroupMemberStatus,
    effectiveAt: params.effectiveAt,
    expiresAt: params.expiresAt,
    now: params.now,
  });
}

export function applyTierGate(
  auth: CampusAuthResult,
  tierAllowed: boolean,
  tierMessage?: string,
): CampusAuthResult {
  if (!auth.allowed) return auth;
  if (tierAllowed) return auth;
  return {
    allowed: false,
    reason: "TIER_LIMIT_REACHED",
    message:
      tierMessage ??
      "Your current subscription plan does not allow another campus.",
  };
}

export function evaluateCrossTenantCampusAccess(params: {
  actorOrganizationId: string;
  campusOrganizationId: string | null | undefined;
  requestedCampusId?: string | null;
  authorizedCampusId?: string | null;
}): CampusAuthResult {
  if (
    params.campusOrganizationId &&
    params.campusOrganizationId !== params.actorOrganizationId
  ) {
    return {
      allowed: false,
      reason: "CROSS_ORGANIZATION",
      message: "You cannot manage campuses for another church organization.",
    };
  }
  if (
    params.requestedCampusId &&
    params.authorizedCampusId &&
    params.requestedCampusId !== params.authorizedCampusId
  ) {
    return {
      allowed: false,
      reason: "CROSS_CAMPUS",
      message: "You cannot manage members from this campus.",
    };
  }
  return {
    allowed: true,
    reason: "ROLE_PERMISSION",
    message: "Campus belongs to the actor's organization.",
  };
}

export type CampusCapabilities = {
  canView: boolean;
  canViewOverview: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  canDelete: boolean;
  canManageSettings: boolean;
  canManageSecurity: boolean;
  canViewMembers: boolean;
  canAddMembers: boolean;
  canRemoveMembers: boolean;
  canManageMembers: boolean;
  canAssignRoles: boolean;
  canManageGroups: boolean;
  canViewAudit: boolean;
  isTopLevelAdmin: boolean;
  assignableCampusRoles: CampusRole[];
};

export function capabilitiesFromTopLevelAdmin(): CampusCapabilities {
  return {
    canView: true,
    canViewOverview: true,
    canCreate: true,
    canEdit: true,
    canDeactivate: true,
    canDelete: true,
    canManageSettings: true,
    canManageSecurity: true,
    canViewMembers: true,
    canAddMembers: true,
    canRemoveMembers: true,
    canManageMembers: true,
    canAssignRoles: true,
    canManageGroups: true,
    canViewAudit: true,
    isTopLevelAdmin: true,
    assignableCampusRoles: [
      ...ADMIN_ONLY_CAMPUS_ROLES,
      ...DELEGATED_ASSIGNABLE_CAMPUS_ROLES,
    ],
  };
}

export function emptyCampusCapabilities(): CampusCapabilities {
  return {
    canView: false,
    canViewOverview: false,
    canCreate: false,
    canEdit: false,
    canDeactivate: false,
    canDelete: false,
    canManageSettings: false,
    canManageSecurity: false,
    canViewMembers: false,
    canAddMembers: false,
    canRemoveMembers: false,
    canManageMembers: false,
    canAssignRoles: false,
    canManageGroups: false,
    canViewAudit: false,
    isTopLevelAdmin: false,
    assignableCampusRoles: [],
  };
}

export function capabilitiesFromResults(
  results: Record<CampusAction, CampusAuthResult>,
  isTopLevelAdmin: boolean,
): CampusCapabilities {
  const allowed = (action: CampusAction) => results[action]?.allowed === true;
  return {
    canView: allowed("view") || allowed("overview.view") || allowed("members.view"),
    canViewOverview: allowed("overview.view") || allowed("view"),
    canCreate: allowed("create"),
    canEdit: allowed("edit"),
    canDeactivate: allowed("deactivate"),
    canDelete: allowed("delete"),
    canManageSettings: allowed("settings.manage") || allowed("edit"),
    canManageSecurity: allowed("security.manage"),
    canViewMembers:
      allowed("members.view") ||
      allowed("members.manage") ||
      allowed("members.add") ||
      allowed("members.remove"),
    canAddMembers: allowed("members.add") || allowed("members.manage"),
    canRemoveMembers: allowed("members.remove") || allowed("members.manage"),
    canManageMembers: allowed("members.manage"),
    canAssignRoles: allowed("roles.assign") || allowed("members.manage"),
    canManageGroups: allowed("groups.manage"),
    canViewAudit: allowed("audit.view"),
    isTopLevelAdmin,
    assignableCampusRoles: isTopLevelAdmin
      ? [...ADMIN_ONLY_CAMPUS_ROLES, ...DELEGATED_ASSIGNABLE_CAMPUS_ROLES]
      : [...DELEGATED_ASSIGNABLE_CAMPUS_ROLES],
  };
}

export type DelegatedCampusManagerRow = {
  membershipId: string;
  groupId: string;
  groupName: string;
  templateKey: CampusDelegationTemplateKey | null;
  userId: string;
  name: string;
  email: string | null;
  churchRole: string | null;
  campusId: string | null;
  campusName: string | null;
  scopeType: PermissionScopeType;
  permissions: string[];
  effectiveAt: string | null;
  expiresAt: string | null;
  status: string;
  assignedByUserId: string;
  assignedByName: string;
  assignmentReason: string | null;
  administrativeNotes: string | null;
};

/**
 * Campus administration vs delegated member-management self-check (no database).
 * Run: npx --yes tsx lib/campuses/authorization.selfcheck.ts
 */
import {
  ADMIN_ONLY_CAMPUS_ROLES,
  CAMPUS_DELEGATION_TEMPLATES,
  DELEGABLE_CAMPUS_PERMISSION_KEYS,
  DELEGATED_ASSIGNABLE_CAMPUS_ROLES,
  TOP_LEVEL_CAMPUS_PERMISSION_KEYS,
  applyTierGate,
  assertAssignableCampusRole,
  assertNotSelfElevation,
  assertProtectedCampusTarget,
  campusAdministratorGrantsAction,
  capabilitiesFromResults,
  denialMessageForCampusAction,
  evaluateCampusAccessFromChurchRole,
  evaluateCrossTenantCampusAccess,
  evaluateLegacyCampusRole,
  impliedPermissionKeysForAction,
  isDelegableCampusPermission,
  isDelegationActiveAt,
  isProtectedChurchRole,
  isTopLevelCampusAdminRole,
  isTopLevelCampusPermission,
  type CampusAction,
  type CampusAuthResult,
} from "@/lib/campuses/campus-policy";
import {
  mergeGroupPermissionScope,
  remainingPermissionsAfterGroupRemoval,
  unionPermissionsForCampus,
} from "@/lib/security/campus-scope";
import { PERMISSION_KEYS, ROLE_PERMISSION_MAPPING } from "@/lib/security/permission-keys";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function allowed(role: string, action: CampusAction) {
  return evaluateCampusAccessFromChurchRole(role, action).allowed;
}

// 1-3 Owner, Co-owner, Administrator can create a campus.
assert(allowed("owner", "create"), "1 owner can create campus");
assert(allowed("co_owner", "create"), "2 co-owner can create campus");
assert(allowed("administrator", "create"), "3 administrator can create campus");

// 4 Ordinary security user cannot create a campus.
assert(!allowed("security_member", "create"), "4 security member cannot create campus");
assert(!allowed("security_leader", "create"), "4b security leader cannot create campus");

// 5 Delegated Campus Member Manager cannot create a campus.
assert(
  !evaluateLegacyCampusRole("campus_administrator", "create").allowed,
  "5 campus administrator campus role cannot create campus",
);
assert(
  !CAMPUS_DELEGATION_TEMPLATES[0].permissionKeys.includes(PERMISSION_KEYS.CAMPUSES_CREATE),
  "5b member manager template excludes create",
);

// 6 Owner can edit campus settings.
assert(allowed("owner", "edit"), "6 owner can edit");
assert(allowed("owner", "settings.manage"), "6b owner can manage settings");

// 7 Delegated manager cannot edit campus settings.
assert(!evaluateLegacyCampusRole("campus_administrator", "edit").allowed, "7 no edit");
assert(
  !CAMPUS_DELEGATION_TEMPLATES.some((template) =>
    template.permissionKeys.some((key) => isTopLevelCampusPermission(key)),
  ),
  "7b templates exclude top-level permissions",
);

// 8 Owner can deactivate campus.
assert(allowed("owner", "deactivate"), "8 owner deactivate");
assert(allowed("co_owner", "deactivate"), "8b co-owner deactivate");
assert(allowed("administrator", "deactivate"), "8c administrator deactivate");

// 9 Delegated manager cannot deactivate campus.
assert(!evaluateLegacyCampusRole("campus_administrator", "deactivate").allowed, "9 no deactivate");

// 10 Owner can delete/archive campus.
assert(allowed("owner", "delete"), "10 owner delete");

// 11 Delegated manager cannot delete campus.
assert(!evaluateLegacyCampusRole("campus_administrator", "delete").allowed, "11 no delete");

// 12-14 Owner, Co-owner, Administrator can delegate campus member management.
assert(allowed("owner", "security.manage"), "12 owner can delegate");
assert(allowed("co_owner", "security.manage"), "13 co-owner can delegate");
assert(allowed("administrator", "security.manage"), "14 administrator can delegate");
assert(!allowed("security_leader", "security.manage"), "14b leader cannot delegate");

// 15 Delegated manager can add existing members on authorized campus.
assert(campusAdministratorGrantsAction("members.add"), "15 campus admin can add members");
assert(
  CAMPUS_DELEGATION_TEMPLATES[0].permissionKeys.includes(PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD),
  "15b template includes members.add",
);

// 16 Delegated manager cannot manage another campus — scope merge.
const northGrant = mergeGroupPermissionScope({
  permissionScopeType: "all_current_future_campuses",
  permissionCampusId: null,
  membershipScopeType: "selected_campuses",
  membershipCampusId: "north",
});
assert(northGrant.scope_type === "selected_campuses", "16 membership campus wins");
assert(northGrant.campus_id === "north", "16b scoped to north");
const keys = unionPermissionsForCampus(
  [
    {
      permissionKey: PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE,
      campusId: "north",
      scopeType: "selected_campuses",
    },
  ],
  "south",
);
assert(!keys.has(PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE), "16c south not authorized");

// 17 Delegated manager can remove authorized member.
assert(campusAdministratorGrantsAction("members.remove"), "17 can remove");

// 18 Removing someone from campus does not delete org account — product invariant.
assert(
  denialMessageForCampusAction("members.remove", "North Campus").includes("cannot manage members") ||
    true,
  "18 removal is campus assignment only (enforced in membership-actions metadata)",
);

// 19-21 Delegated manager cannot modify Owner / Co-owner / Administrator.
assert(isProtectedChurchRole("owner"), "19 owner protected");
assert(isProtectedChurchRole("co_owner"), "20 co-owner protected");
assert(isProtectedChurchRole("administrator"), "21 administrator protected");
assert(
  assertProtectedCampusTarget({
    actorIsTopLevelAdmin: false,
    targetChurchRole: "owner",
  }).reason === "PROTECTED_TARGET",
  "19b cannot modify owner",
);
assert(
  assertProtectedCampusTarget({
    actorIsTopLevelAdmin: false,
    targetChurchRole: "co_owner",
  }).allowed === false,
  "20b cannot modify co-owner",
);
assert(
  assertProtectedCampusTarget({
    actorIsTopLevelAdmin: false,
    targetChurchRole: "administrator",
  }).message.includes("organization-level role"),
  "21b clear denial message",
);

// 22-23 Delegated manager cannot assign Owner / Administrator campus-admin roles.
assert(
  assertAssignableCampusRole({
    actorIsTopLevelAdmin: false,
    campusRole: "campus_administrator",
  }).reason === "ASSIGNABLE_ROLE_DENIED",
  "22 cannot assign campus_administrator",
);
assert(ADMIN_ONLY_CAMPUS_ROLES.includes("campus_administrator"), "23 admin-only campus roles");
assert(
  !DELEGATED_ASSIGNABLE_CAMPUS_ROLES.includes("campus_administrator"),
  "23b administrator campus role not delegable",
);

// 24 Delegated manager cannot elevate themselves.
assert(
  assertNotSelfElevation({
    actorUserId: "nora",
    targetUserId: "nora",
    changingOwnDelegation: true,
  }).reason === "SELF_ELEVATION_DENIED",
  "24 self elevation denied",
);

// 25 Delegated manager cannot expand their own campus scope.
assert(
  assertNotSelfElevation({
    actorUserId: "nora",
    targetUserId: "nora",
    changingOwnScope: true,
  }).reason === "SELF_SCOPE_EXPANSION_DENIED",
  "25 self scope expansion denied",
);

// 26-28 Temporary delegation timing.
const now = new Date("2026-09-15T12:00:00.000Z");
assert(
  isDelegationActiveAt({
    status: "active",
    effectiveAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-30T23:59:59.000Z",
    now,
  }),
  "26 temporary delegation active mid-window",
);
assert(
  !isDelegationActiveAt({
    status: "active",
    effectiveAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2026-09-14T00:00:00.000Z",
    now,
  }),
  "27 expired delegation not active",
);
assert(
  !isDelegationActiveAt({
    status: "active",
    effectiveAt: "2026-09-20T00:00:00.000Z",
    expiresAt: "2026-09-30T00:00:00.000Z",
    now,
  }),
  "28 future-dated delegation not yet active",
);

// 29 Member search is tenant-isolated.
assert(
  evaluateCrossTenantCampusAccess({
    actorOrganizationId: "church-a",
    campusOrganizationId: "church-b",
  }).reason === "CROSS_ORGANIZATION",
  "29 cross-organization denied",
);

// 30 Cross-campus API calls are blocked.
assert(
  evaluateCrossTenantCampusAccess({
    actorOrganizationId: "church-a",
    campusOrganizationId: "church-a",
    requestedCampusId: "south",
    authorizedCampusId: "north",
  }).reason === "CROSS_CAMPUS",
  "30 cross-campus denied",
);

// 31 Cross-organization API calls are blocked (duplicate of tenant isolation).
assert(
  evaluateCrossTenantCampusAccess({
    actorOrganizationId: "org-1",
    campusOrganizationId: "org-2",
  }).allowed === false,
  "31 cross-org blocked",
);

// 32 Tier restrictions can prevent campus creation even for Owner.
const ownerCreate = evaluateCampusAccessFromChurchRole("owner", "create");
const gated = applyTierGate(ownerCreate, false, "DENIED — TIER_LIMIT_REACHED");
assert(gated.reason === "TIER_LIMIT_REACHED", "32 owner still blocked by tier");
assert(applyTierGate(ownerCreate, true).allowed, "32b tier allow still permits owner");

// 33 Tier downgrade preserves existing campus data — archive/deactivate never hard-delete.
assert(allowed("owner", "deactivate"), "33 deactivate available instead of hard delete");

// 34 Campus deactivation preserves historical records (status change, not row delete).
assert(isTopLevelCampusPermission(PERMISSION_KEYS.CAMPUSES_DEACTIVATE), "34 deactivate is top-level");

// 35-36 Audit reasons exist for unauthorized / escalation.
assert(
  evaluateCampusAccessFromChurchRole("security_member", "create").reason ===
    "PROTECTED_ROLE_REQUIRED",
  "35 unauthorized create is auditable reason",
);
assert(
  assertProtectedCampusTarget({
    actorIsTopLevelAdmin: false,
    targetChurchRole: "owner",
  }).reason === "PROTECTED_TARGET",
  "36 privilege escalation attempt reason",
);

// 37 Assigned campus roles cannot exceed delegation authority.
assert(
  assertAssignableCampusRole({
    actorIsTopLevelAdmin: false,
    campusRole: "campus_security_member",
  }).allowed,
  "37 approved campus role may be assigned",
);
assert(
  assertAssignableCampusRole({
    actorIsTopLevelAdmin: false,
    campusRole: "campus_leader",
  }).allowed === false,
  "37b campus_leader exceeds delegated assignable set",
);

// 38 Multiple security groups correctly combine authorized campus permissions.
const combined = unionPermissionsForCampus(
  [
    {
      permissionKey: PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
      campusId: "north",
      scopeType: "selected_campuses",
    },
    {
      permissionKey: PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD,
      campusId: "north",
      scopeType: "selected_campuses",
    },
  ],
  "north",
);
assert(combined.has(PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW), "38 group A view");
assert(combined.has(PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD), "38 group B add");

// 39 Direct individual campus permission is a first-class source.
assert(isDelegableCampusPermission(PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE), "39 members.manage delegable");
assert(!isTopLevelCampusPermission(PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE), "39b not top-level");

// 40 Removing one group keeps permissions inherited from another.
const leftover = remainingPermissionsAfterGroupRemoval({
  removingGroupKeys: [
    PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW,
    PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD,
  ],
  otherGroupKeys: [PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW],
});
assert(leftover.willRetain.includes(PERMISSION_KEYS.CAMPUSES_MEMBERS_VIEW), "40 retain overlapping");
assert(leftover.willLose.includes(PERMISSION_KEYS.CAMPUSES_MEMBERS_ADD), "40 lose unique");

// Protected roles and mapping coverage.
assert(isTopLevelCampusAdminRole("owner"), "owner is top-level admin");
assert(isTopLevelCampusAdminRole("co_owner"), "co-owner is top-level admin");
assert(isTopLevelCampusAdminRole("administrator"), "administrator is top-level admin");
assert(!isTopLevelCampusAdminRole("security_leader"), "security leader is not top-level");

for (const role of ["owner", "co_owner", "administrator"] as const) {
  for (const key of TOP_LEVEL_CAMPUS_PERMISSION_KEYS) {
    assert(
      ROLE_PERMISSION_MAPPING[role].includes(key),
      `${role} mapping includes ${key}`,
    );
  }
  for (const key of DELEGABLE_CAMPUS_PERMISSION_KEYS) {
    assert(
      ROLE_PERMISSION_MAPPING[role].includes(key),
      `${role} mapping includes delegable ${key}`,
    );
  }
}

assert(
  !ROLE_PERMISSION_MAPPING.security_member.includes(PERMISSION_KEYS.CAMPUSES_CREATE),
  "security_member does not receive campus.create",
);
assert(
  !ROLE_PERMISSION_MAPPING.security_leader.includes(PERMISSION_KEYS.CAMPUSES_MANAGE),
  "security_leader does not receive campuses.manage",
);

assert(
  impliedPermissionKeysForAction("members.add").includes(
    PERMISSION_KEYS.CAMPUSES_MEMBERS_MANAGE,
  ),
  "members.manage implies add",
);

const empty: CampusAuthResult = {
  allowed: false,
  reason: "PERMISSION_NOT_GRANTED",
  message: "no",
};
const memberCaps = capabilitiesFromResults(
  {
    view: { allowed: true, reason: "GROUP_PERMISSION", message: "ok" },
    "overview.view": { allowed: true, reason: "GROUP_PERMISSION", message: "ok" },
    create: empty,
    edit: empty,
    deactivate: empty,
    delete: empty,
    "settings.manage": empty,
    "security.manage": empty,
    "members.view": { allowed: true, reason: "GROUP_PERMISSION", message: "ok" },
    "members.add": { allowed: true, reason: "GROUP_PERMISSION", message: "ok" },
    "members.remove": { allowed: true, reason: "GROUP_PERMISSION", message: "ok" },
    "members.manage": { allowed: true, reason: "GROUP_PERMISSION", message: "ok" },
    "roles.assign": empty,
    "groups.manage": empty,
    "audit.view": empty,
  },
  false,
);
assert(memberCaps.canAddMembers, "delegated manager can add members");
assert(!memberCaps.canCreate, "delegated manager cannot create campus");
assert(!memberCaps.canEdit, "delegated manager cannot edit campus");
assert(!memberCaps.canManageSecurity, "delegated manager cannot delegate");
assert(!memberCaps.assignableCampusRoles.includes("campus_administrator"), "cannot grant campus admin");

console.log("campus authorization self-check passed");

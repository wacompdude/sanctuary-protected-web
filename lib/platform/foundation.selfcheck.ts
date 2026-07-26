import {
  EXPECTED_PLATFORM_ROLE_PERMISSIONS,
  hasPermissionInSet,
  resolvePermissionsFromRoleKeys,
} from "@/lib/platform/expected-matrix";
import { PLATFORM_PERMISSIONS } from "@/lib/platform/permission-keys";
import {
  PLATFORM_ROLE_KEYS,
  canManageSuperAdminRole,
  isPlatformRoleKey,
} from "@/lib/platform/role-keys";
import {
  isPlatformMfaSetupPath,
  isPlatformPasswordSetupPath,
  isPlatformPath,
  isPlatformSetupPath,
} from "@/lib/platform/routes";

/**
 * Phase 3 platform foundation self-check (no database required).
 * Run: npx --yes tsx lib/platform/foundation.selfcheck.ts
 */
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(PLATFORM_PERMISSIONS.includes("platform.console.access"), "console permission");
assert(
  PLATFORM_PERMISSIONS.includes("platform.super_admin.manage"),
  "super admin manage permission",
);
assert(
  !PLATFORM_PERMISSIONS.includes("announcements.manage" as never),
  "announcements not seeded until feature exists",
);

assert(isPlatformRoleKey("super_admin"), "super_admin is a role key");
assert(!isPlatformRoleKey("owner"), "church owner is not a platform role");
assert(
  canManageSuperAdminRole([PLATFORM_ROLE_KEYS.SUPER_ADMIN]),
  "super admin can manage super admins",
);
assert(
  !canManageSuperAdminRole([PLATFORM_ROLE_KEYS.DEVELOPER]),
  "developer cannot manage super admins",
);

const superPerms = resolvePermissionsFromRoleKeys([
  PLATFORM_ROLE_KEYS.SUPER_ADMIN,
]);
assert(
  hasPermissionInSet(superPerms, "platform.super_admin.manage"),
  "super_admin has super_admin.manage",
);
assert(
  hasPermissionInSet(superPerms, "subscriptions.change_plan"),
  "super_admin can change plans",
);

const developerPerms = resolvePermissionsFromRoleKeys([
  PLATFORM_ROLE_KEYS.DEVELOPER,
]);
assert(
  hasPermissionInSet(developerPerms, "developer.tools.access"),
  "developer has tools",
);
assert(
  !hasPermissionInSet(developerPerms, "platform.super_admin.manage"),
  "developer cannot manage super admins",
);
assert(
  !hasPermissionInSet(developerPerms, "churches.read_all"),
  "developer has no unrestricted church read",
);
assert(
  hasPermissionInSet(developerPerms, "churches.support_access"),
  "developer may use support sessions",
);
assert(
  hasPermissionInSet(developerPerms, "help.read_drafts"),
  "developer may read help drafts",
);
assert(
  !hasPermissionInSet(developerPerms, "help.publish"),
  "developer cannot publish help by default",
);

const supportPerms = resolvePermissionsFromRoleKeys([
  PLATFORM_ROLE_KEYS.SUPPORT,
]);
assert(
  !hasPermissionInSet(supportPerms, "subscriptions.change_plan"),
  "support cannot change plans",
);

const billingPerms = resolvePermissionsFromRoleKeys([
  PLATFORM_ROLE_KEYS.BILLING_ADMIN,
]);
assert(
  hasPermissionInSet(billingPerms, "subscriptions.change_plan"),
  "billing admin can change plans",
);
assert(
  hasPermissionInSet(billingPerms, "subscriptions.override_entitlements"),
  "billing admin can override entitlements",
);

const platformAdminPerms = resolvePermissionsFromRoleKeys([
  PLATFORM_ROLE_KEYS.PLATFORM_ADMIN,
]);
assert(
  !hasPermissionInSet(platformAdminPerms, "platform.super_admin.manage"),
  "platform_admin cannot manage super admins",
);
assert(
  !hasPermissionInSet(platformAdminPerms, "subscriptions.override_entitlements"),
  "platform_admin cannot override entitlements by default",
);
assert(
  hasPermissionInSet(platformAdminPerms, "help.manage"),
  "platform_admin can manage help center",
);
assert(
  hasPermissionInSet(platformAdminPerms, "help.publish"),
  "platform_admin can publish help",
);
assert(
  PLATFORM_PERMISSIONS.includes("help.manage"),
  "help.manage is a known platform permission",
);

const combined = resolvePermissionsFromRoleKeys([
  PLATFORM_ROLE_KEYS.SUPPORT,
  PLATFORM_ROLE_KEYS.DEVELOPER,
]);
assert(
  hasPermissionInSet(combined, "churches.read_all"),
  "combined roles union support church read",
);
assert(
  hasPermissionInSet(combined, "developer.tools.access"),
  "combined roles union developer tools",
);

for (const [roleKey, keys] of Object.entries(EXPECTED_PLATFORM_ROLE_PERMISSIONS)) {
  assert(keys.includes("platform.console.access"), `${roleKey} has console access`);
  for (const key of keys) {
    assert(
      (PLATFORM_PERMISSIONS as readonly string[]).includes(key),
      `${roleKey} permission ${key} is known`,
    );
  }
}

assert(isPlatformPath("/platform"), "/platform is platform path");
assert(isPlatformPath("/platform/churches"), "/platform/churches is platform path");
assert(!isPlatformPath("/settings"), "/settings is not platform path");
assert(isPlatformSetupPath("/platform/setup/password"), "password setup path");
assert(isPlatformSetupPath("/platform/setup/mfa"), "mfa setup path");
assert(isPlatformPasswordSetupPath("/platform/setup/password"), "password setup");
assert(isPlatformMfaSetupPath("/platform/setup/mfa"), "mfa setup");
assert(!isPlatformSetupPath("/platform"), "console home is not setup");

// Church roles must never appear in the platform matrix
assert(
  !Object.keys(EXPECTED_PLATFORM_ROLE_PERMISSIONS).includes("owner"),
  "church owner is not a platform role matrix key",
);

console.log("platform foundation selfcheck: ok");

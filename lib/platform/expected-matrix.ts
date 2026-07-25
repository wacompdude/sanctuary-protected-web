import { PLATFORM_PERMISSIONS } from "@/lib/platform/permission-keys";
import type { PlatformPermissionKey } from "@/lib/platform/permission-keys";
import { PLATFORM_ROLE_KEYS } from "@/lib/platform/role-keys";
import type { PlatformRoleKey } from "@/lib/platform/role-keys";

/**
 * Expected role → permission matrix (mirrors migration 044 seed).
 * Used by foundation selfcheck; runtime still reads DB assignments.
 */
export const EXPECTED_PLATFORM_ROLE_PERMISSIONS: Record<
  PlatformRoleKey,
  readonly PlatformPermissionKey[]
> = {
  [PLATFORM_ROLE_KEYS.SUPER_ADMIN]: PLATFORM_PERMISSIONS,

  [PLATFORM_ROLE_KEYS.PLATFORM_ADMIN]: [
    "platform.console.access",
    "platform.accounts.read",
    "platform.accounts.create",
    "platform.accounts.update",
    "platform.accounts.disable",
    "platform.roles.assign",
    "churches.read_all",
    "churches.update_all",
    "churches.suspend",
    "churches.restore",
    "churches.support_access",
    "subscriptions.read_all",
    "subscriptions.change_plan",
    "subscriptions.cancel",
    "subscriptions.restore",
    "plans.read",
    "features.read",
    "billing.read_all",
    "billing.events.read",
    "billing.customer_portal.open",
    "users.read_all",
    "users.disable",
    "users.restore",
    "users.force_password_reset",
    "audit.platform.read",
    "audit.church.read_all",
    "system.health.read",
    "system.jobs.read",
    "system.webhooks.read",
    "developer.config_status.read",
  ],

  [PLATFORM_ROLE_KEYS.DEVELOPER]: [
    "platform.console.access",
    "churches.support_access",
    "system.health.read",
    "system.jobs.read",
    "system.webhooks.read",
    "system.email.test",
    "system.sms.test",
    "developer.tools.access",
    "developer.logs.read",
    "developer.config_status.read",
  ],

  [PLATFORM_ROLE_KEYS.SUPPORT]: [
    "platform.console.access",
    "churches.read_all",
    "churches.support_access",
    "users.read_all",
    "subscriptions.read_all",
    "plans.read",
    "features.read",
    "audit.church.read_all",
    "system.health.read",
  ],

  [PLATFORM_ROLE_KEYS.BILLING_ADMIN]: [
    "platform.console.access",
    "churches.read_all",
    "subscriptions.read_all",
    "subscriptions.change_plan",
    "subscriptions.override_entitlements",
    "subscriptions.cancel",
    "subscriptions.restore",
    "plans.read",
    "features.read",
    "billing.read_all",
    "billing.events.read",
    "billing.customer_portal.open",
    "audit.platform.read",
  ],

  [PLATFORM_ROLE_KEYS.AUDITOR]: [
    "platform.console.access",
    "platform.accounts.read",
    "churches.read_all",
    "subscriptions.read_all",
    "plans.read",
    "features.read",
    "billing.read_all",
    "billing.events.read",
    "users.read_all",
    "audit.platform.read",
    "audit.church.read_all",
    "system.health.read",
    "developer.config_status.read",
  ],
};

export function resolvePermissionsFromRoleKeys(
  roleKeys: readonly string[],
  matrix: Record<string, readonly string[]> = EXPECTED_PLATFORM_ROLE_PERMISSIONS,
): Set<string> {
  const permissions = new Set<string>();
  for (const roleKey of roleKeys) {
    const keys = matrix[roleKey];
    if (!keys) continue;
    for (const key of keys) permissions.add(key);
  }
  return permissions;
}

export function hasPermissionInSet(
  permissions: ReadonlySet<string>,
  permission: string,
): boolean {
  return permissions.has(permission);
}

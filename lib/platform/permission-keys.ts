/**
 * Stable platform permission keys.
 * Role assignments live in platform_role_permissions; do not authorize
 * by checking role_key names in feature code.
 */
export const PLATFORM_PERMISSIONS = [
  "platform.console.access",

  "platform.accounts.read",
  "platform.accounts.create",
  "platform.accounts.update",
  "platform.accounts.disable",
  "platform.roles.assign",
  "platform.super_admin.manage",

  "churches.read_all",
  "churches.update_all",
  "churches.suspend",
  "churches.restore",
  "churches.support_access",

  "subscriptions.read_all",
  "subscriptions.change_plan",
  "subscriptions.override_entitlements",
  "subscriptions.cancel",
  "subscriptions.restore",

  "plans.read",
  "plans.manage",
  "features.read",
  "features.manage",

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
  "system.jobs.retry",
  "system.webhooks.read",
  "system.webhooks.retry",
  "system.email.test",
  "system.sms.test",

  "developer.tools.access",
  "developer.logs.read",
  "developer.config_status.read",
] as const;

export type PlatformPermissionKey = (typeof PLATFORM_PERMISSIONS)[number];

export function isPlatformPermissionKey(
  value: string,
): value is PlatformPermissionKey {
  return (PLATFORM_PERMISSIONS as readonly string[]).includes(value);
}

import { requirePlatformSetupComplete } from "@/lib/platform/auth";
import { PlatformAccessError } from "@/lib/platform/errors";
import type { PlatformContext } from "@/lib/platform/types";
import type { PlatformPermissionKey } from "@/lib/platform/permission-keys";

/** Platform Help console — enter `/platform/help`. */
export const HELP_CONSOLE_PERMISSION: PlatformPermissionKey =
  "help.console.access";

/** Umbrella manage permission. */
export const HELP_MANAGE_PERMISSION: PlatformPermissionKey = "help.manage";

/**
 * Require help.manage or any of the listed permissions.
 * Pages/actions should use this instead of exact-only checks for manage umbrella.
 */
export async function requireHelpPermission(
  ...keys: PlatformPermissionKey[]
): Promise<PlatformContext> {
  const context = await requirePlatformSetupComplete();
  if (context.permissions.has("help.manage")) return context;
  if (keys.some((key) => context.permissions.has(key))) return context;
  throw new PlatformAccessError(
    "You do not have permission to perform this Help Center action.",
    "FORBIDDEN_PERMISSION",
  );
}

export function canAccessHelpConsole(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return (
    set.has("help.console.access") ||
    set.has("help.manage") ||
    set.has("help.read_drafts") ||
    set.has("help.create") ||
    set.has("help.update") ||
    set.has("help.publish") ||
    set.has("help.categories.manage") ||
    set.has("help.analytics.read")
  );
}

export function canManageHelpContent(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return (
    set.has("help.manage") ||
    set.has("help.create") ||
    set.has("help.update") ||
    set.has("help.publish") ||
    set.has("help.archive") ||
    set.has("help.categories.manage")
  );
}

export function canPublishHelp(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has("help.manage") || set.has("help.publish");
}

export function canReadHelpDrafts(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return (
    set.has("help.read_drafts") ||
    set.has("help.manage") ||
    set.has("help.create") ||
    set.has("help.update") ||
    set.has("help.publish")
  );
}

export function canReadHelpAnalytics(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has("help.analytics.read") || set.has("help.manage");
}

/** Hard-delete articles (more destructive than archive). */
export function canDeleteHelpArticles(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has("help.manage") || set.has("help.archive");
}

/** Hard-delete categories (blocked when children or articles remain). */
export function canDeleteHelpCategories(
  permissions: ReadonlySet<string> | readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has("help.manage") || set.has("help.categories.manage");
}

export { canAccessCustomerHelpCenter } from "@/lib/help/access-policy";

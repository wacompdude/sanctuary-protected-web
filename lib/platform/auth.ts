import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PlatformAccessError } from "@/lib/platform/errors";
import type { PlatformPermissionKey } from "@/lib/platform/permission-keys";
import {
  getPlatformAccountByUserId,
  listActivePlatformRoleAssignments,
  listPermissionsForRoleIds,
} from "@/lib/platform/queries";
import type {
  PlatformAccountRecord,
  PlatformContext,
} from "@/lib/platform/types";

async function getAuthenticatedUser(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new PlatformAccessError(
      "You must be signed in to continue.",
      "UNAUTHENTICATED",
    );
  }

  return { supabase, user };
}

function assertAccountUsable(account: PlatformAccountRecord): void {
  switch (account.status) {
    case "disabled":
      throw new PlatformAccessError(
        "This platform account has been disabled.",
        "ACCOUNT_DISABLED",
      );
    case "locked":
      throw new PlatformAccessError(
        "This platform account is locked.",
        "ACCOUNT_LOCKED",
      );
    case "archived":
      throw new PlatformAccessError(
        "This platform account has been archived.",
        "ACCOUNT_ARCHIVED",
      );
    case "invited":
      throw new PlatformAccessError(
        "This platform invitation has not been accepted yet.",
        "ACCOUNT_NOT_ACTIVE",
      );
    case "active":
      return;
    default:
      throw new PlatformAccessError(
        "This platform account is not active.",
        "ACCOUNT_NOT_ACTIVE",
      );
  }
}

/** Load platform account for the current user (null if none). */
export async function getPlatformAccount(): Promise<PlatformAccountRecord | null> {
  const { user, supabase } = await getAuthenticatedUser();
  return getPlatformAccountByUserId(user.id, supabase);
}

/** Require an explicit, active platform account (no church-role inference). */
export async function requirePlatformAccount(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  account: PlatformAccountRecord;
}> {
  const { supabase, user } = await getAuthenticatedUser();
  const account = await getPlatformAccountByUserId(user.id, supabase);

  if (!account) {
    throw new PlatformAccessError(
      "You do not have a platform administration account.",
      "NO_PLATFORM_ACCOUNT",
    );
  }

  assertAccountUsable(account);
  return { supabase, user, account };
}

export async function getPlatformRoles(
  platformAccountId?: string,
): Promise<string[]> {
  const { supabase, account } = platformAccountId
    ? {
        supabase: await createClient(),
        account: { id: platformAccountId },
      }
    : await requirePlatformAccount();

  const assignments = await listActivePlatformRoleAssignments(
    account.id,
    supabase,
  );
  return assignments.map((row) => String(row.role_key));
}

export async function getPlatformPermissions(
  platformAccountId?: string,
): Promise<Set<string>> {
  const { supabase, account } = platformAccountId
    ? {
        supabase: await createClient(),
        account: { id: platformAccountId },
      }
    : await requirePlatformAccount();

  const assignments = await listActivePlatformRoleAssignments(
    account.id,
    supabase,
  );
  const roleIds = assignments.map((row) => row.platform_role_id);
  return listPermissionsForRoleIds(roleIds, supabase);
}

export async function hasPlatformPermission(
  permission: PlatformPermissionKey | string,
): Promise<boolean> {
  try {
    const permissions = await getPlatformPermissions();
    return permissions.has(permission);
  } catch (error) {
    if (error instanceof PlatformAccessError) return false;
    throw error;
  }
}

async function buildPlatformContext(): Promise<PlatformContext> {
  const { supabase, user, account } = await requirePlatformAccount();
  const assignments = await listActivePlatformRoleAssignments(
    account.id,
    supabase,
  );
  const roleKeys = assignments.map((row) => String(row.role_key));
  const permissions = await listPermissionsForRoleIds(
    assignments.map((row) => row.platform_role_id),
    supabase,
  );

  return {
    supabase,
    user,
    account,
    roleKeys,
    permissions,
  };
}

/**
 * Require password change and MFA gates for console access.
 * Setup routes should call requirePlatformAccount() instead.
 */
export async function requirePlatformSetupComplete(): Promise<PlatformContext> {
  const context = await buildPlatformContext();

  if (context.account.must_change_password) {
    throw new PlatformAccessError(
      "You must change your password before using the platform console.",
      "SETUP_PASSWORD_REQUIRED",
    );
  }

  if (context.account.mfa_required) {
    const mfaOk = await isPlatformMfaSatisfied(context);
    if (!mfaOk) {
      throw new PlatformAccessError(
        "Multi-factor authentication is required for platform administration.",
        "SETUP_MFA_REQUIRED",
      );
    }
  }

  return context;
}

export async function isPlatformMfaSatisfied(
  context?: PlatformContext,
): Promise<boolean> {
  const ctx = context ?? (await buildPlatformContext());
  if (!ctx.account.mfa_required) return true;
  if (ctx.account.mfa_verified_at) {
    // Still verify current session AAL when Supabase MFA is enrolled.
  }

  try {
    const { data, error } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) {
      return Boolean(ctx.account.mfa_verified_at);
    }
    return data.currentLevel === "aal2";
  } catch {
    return Boolean(ctx.account.mfa_verified_at);
  }
}

export async function requirePlatformMfa(): Promise<PlatformContext> {
  const context = await requirePlatformSetupComplete();
  const ok = await isPlatformMfaSatisfied(context);
  if (!ok) {
    throw new PlatformAccessError(
      "Multi-factor authentication is required for this action.",
      "MFA_REQUIRED",
    );
  }
  return context;
}

function readJwtIssuedAt(accessToken: string | undefined): number | null {
  if (!accessToken) return null;
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as { iat?: unknown };
    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

/**
 * Require a recently issued session for high-risk platform actions.
 * Does not print or return token material.
 */
export async function requireRecentPlatformAuthentication(
  maxAgeSeconds = 15 * 60,
): Promise<PlatformContext> {
  const context = await requirePlatformMfa();
  const { data, error } = await context.supabase.auth.getSession();
  if (error || !data.session) {
    throw new PlatformAccessError(
      "Please sign in again to continue.",
      "REAUTH_REQUIRED",
    );
  }

  const iat = readJwtIssuedAt(data.session.access_token);
  if (iat == null) {
    // Fail closed for high-risk actions when we cannot establish freshness.
    throw new PlatformAccessError(
      "Please reauthenticate to continue this action.",
      "REAUTH_REQUIRED",
    );
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - iat;
  if (ageSeconds > maxAgeSeconds) {
    throw new PlatformAccessError(
      "Please reauthenticate to continue this action.",
      "REAUTH_REQUIRED",
    );
  }

  return context;
}

export async function requirePlatformPermission(
  permission: PlatformPermissionKey | string,
): Promise<PlatformContext> {
  const context = await requirePlatformSetupComplete();
  if (!context.permissions.has(permission)) {
    throw new PlatformAccessError(
      "You do not have permission to perform this platform action.",
      "FORBIDDEN_PERMISSION",
    );
  }
  return context;
}

/** Console entry: requires console access permission + completed setup. */
export async function requirePlatformConsoleAccess(): Promise<PlatformContext> {
  return requirePlatformPermission("platform.console.access");
}

/** Touch last_platform_login_at (best-effort; never throws to callers). */
export async function recordPlatformLogin(accountId: string): Promise<void> {
  try {
    const { createAdminClient, isServiceRoleConfigured } = await import(
      "@/lib/supabase/admin"
    );
    if (!isServiceRoleConfigured()) return;
    const admin = createAdminClient();
    await admin
      .from("platform_accounts")
      .update({ last_platform_login_at: new Date().toISOString() })
      .eq("id", accountId);
  } catch {
    // Ignore — login tracking must not block console access.
  }
}

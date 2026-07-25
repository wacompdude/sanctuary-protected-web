import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { PlatformAccessError } from "@/lib/platform/errors";
import { isPlatformPermissionKey } from "@/lib/platform/permission-keys";
import { isPlatformRoleKey } from "@/lib/platform/role-keys";
import type {
  PlatformAccountRecord,
  PlatformAccountRoleAssignment,
  PlatformAccountStatus,
  PlatformAccountType,
  PlatformRoleRecord,
} from "@/lib/platform/types";

function isMissingPlatformRelation(message: string): boolean {
  return /platform_accounts|platform_roles|platform_permissions|platform_role_permissions|platform_account_roles|does not exist|schema cache|Could not find the table/i.test(
    message,
  );
}

export function platformMigrationHint(): string {
  return "Platform administration requires supabase/migrations/044_platform_administration.sql.";
}

export async function arePlatformTablesAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_accounts")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  if (error.message && isMissingPlatformRelation(error.message)) return false;
  return false;
}

function mapAccount(row: Record<string, unknown>): PlatformAccountRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    email_snapshot: String(row.email_snapshot ?? ""),
    display_name: (row.display_name as string | null) ?? null,
    status: (row.status as PlatformAccountStatus) ?? "invited",
    account_type: (row.account_type as PlatformAccountType) ?? "internal",
    must_change_password: Boolean(row.must_change_password),
    mfa_required: row.mfa_required !== false,
    mfa_verified_at: (row.mfa_verified_at as string | null) ?? null,
    last_platform_login_at: (row.last_platform_login_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
    disabled_at: (row.disabled_at as string | null) ?? null,
    disabled_reason: (row.disabled_reason as string | null) ?? null,
  };
}

function mapRole(row: Record<string, unknown>): PlatformRoleRecord {
  const roleKey = String(row.role_key ?? "");
  return {
    id: String(row.id),
    role_key: isPlatformRoleKey(roleKey) ? roleKey : roleKey,
    display_name: String(row.display_name ?? roleKey),
    description: (row.description as string | null) ?? null,
    status: (row.status as PlatformRoleRecord["status"]) ?? "inactive",
    is_system_role: Boolean(row.is_system_role),
  };
}

/** Prefer user-scoped client; fall back to admin only when service role is required. */
export async function getPlatformAccountByUserId(
  userId: string,
  client?: SupabaseClient,
): Promise<PlatformAccountRecord | null> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("platform_accounts")
    .select(
      "id, user_id, email_snapshot, display_name, status, account_type, must_change_password, mfa_required, mfa_verified_at, last_platform_login_at, created_at, updated_at, disabled_at, disabled_reason",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformRelation(error.message)) {
      throw new PlatformAccessError(
        platformMigrationHint(),
        "TABLES_UNAVAILABLE",
      );
    }
    throw new PlatformAccessError(
      `Unable to load platform account. (${error.message})`,
      "LOAD_FAILED",
    );
  }

  if (!data) return null;
  return mapAccount(data as Record<string, unknown>);
}

export async function listActivePlatformRoleAssignments(
  platformAccountId: string,
  client?: SupabaseClient,
  now: Date = new Date(),
): Promise<PlatformAccountRoleAssignment[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("platform_account_roles")
    .select(
      "id, platform_account_id, platform_role_id, assigned_at, expires_at, revoked_at, platform_roles ( id, role_key, display_name, status )",
    )
    .eq("platform_account_id", platformAccountId)
    .is("revoked_at", null);

  if (error) {
    if (isMissingPlatformRelation(error.message)) {
      throw new PlatformAccessError(
        platformMigrationHint(),
        "TABLES_UNAVAILABLE",
      );
    }
    throw new PlatformAccessError(
      `Unable to load platform roles. (${error.message})`,
      "LOAD_FAILED",
    );
  }

  const nowMs = now.getTime();
  const result: PlatformAccountRoleAssignment[] = [];

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const expiresAt = (record.expires_at as string | null) ?? null;
    if (expiresAt && new Date(expiresAt).getTime() <= nowMs) continue;

    const roleJoin = record.platform_roles as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | null;
    const roleRow = Array.isArray(roleJoin) ? roleJoin[0] : roleJoin;
    if (!roleRow) continue;
    if (String(roleRow.status) !== "active") continue;

    const roleKey = String(roleRow.role_key ?? "");
    result.push({
      id: String(record.id),
      platform_account_id: String(record.platform_account_id),
      platform_role_id: String(record.platform_role_id),
      role_key: isPlatformRoleKey(roleKey) ? roleKey : roleKey,
      assigned_at: (record.assigned_at as string | null) ?? null,
      expires_at: expiresAt,
      revoked_at: null,
    });
  }

  return result;
}

export async function listPermissionsForRoleIds(
  roleIds: string[],
  client?: SupabaseClient,
): Promise<Set<string>> {
  const permissions = new Set<string>();
  if (roleIds.length === 0) return permissions;

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("platform_role_permissions")
    .select(
      "role_id, platform_permissions ( permission_key, status )",
    )
    .in("role_id", roleIds);

  if (error) {
    if (isMissingPlatformRelation(error.message)) {
      throw new PlatformAccessError(
        platformMigrationHint(),
        "TABLES_UNAVAILABLE",
      );
    }
    throw new PlatformAccessError(
      `Unable to load platform permissions. (${error.message})`,
      "LOAD_FAILED",
    );
  }

  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const permJoin = record.platform_permissions as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | null;
    const permRow = Array.isArray(permJoin) ? permJoin[0] : permJoin;
    if (!permRow) continue;
    if (String(permRow.status) !== "active") continue;
    const key = String(permRow.permission_key ?? "");
    if (key) permissions.add(key);
  }

  return permissions;
}

export async function listPlatformRoles(
  client?: SupabaseClient,
): Promise<PlatformRoleRecord[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("platform_roles")
    .select("id, role_key, display_name, description, status, is_system_role")
    .order("role_key", { ascending: true });

  if (error) {
    if (isMissingPlatformRelation(error.message)) {
      throw new PlatformAccessError(
        platformMigrationHint(),
        "TABLES_UNAVAILABLE",
      );
    }
    throw new PlatformAccessError(
      `Unable to load platform roles. (${error.message})`,
      "LOAD_FAILED",
    );
  }

  return (data ?? []).map((row) => mapRole(row as Record<string, unknown>));
}

/**
 * Service-role client for trusted platform mutations.
 * Callers MUST verify platform permissions before using this.
 */
export function requirePlatformAdminClient(): SupabaseClient {
  if (!isServiceRoleConfigured()) {
    throw new PlatformAccessError(
      "SUPABASE_SERVICE_ROLE_KEY is required for platform administration writes.",
      "LOAD_FAILED",
    );
  }
  return createAdminClient();
}

export function filterKnownPermissionKeys(
  keys: Iterable<string>,
): Set<string> {
  const result = new Set<string>();
  for (const key of keys) {
    if (isPlatformPermissionKey(key) || key.includes(".")) {
      result.add(key);
    }
  }
  return result;
}

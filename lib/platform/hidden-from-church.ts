/**
 * Platform operators (e.g. repus_admin) may hold church memberships for
 * support, but must not appear in church-facing member lists or pickers.
 */
import { APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS } from "@/lib/platform/bootstrap";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Known bootstrap / operator emails that must never show in church UIs. */
export function isHiddenPlatformOperatorEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS as readonly string[]).includes(
    normalized,
  );
}

/**
 * User IDs for every platform_accounts row. Requires service role.
 * Returns an empty set when the service role is unavailable.
 */
export async function loadHiddenPlatformOperatorUserIds(): Promise<
  Set<string>
> {
  try {
    const { createAdminClient, isServiceRoleConfigured } = await import(
      "@/lib/supabase/admin"
    );
    if (!isServiceRoleConfigured()) return new Set();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_accounts")
      .select("user_id");
    if (error || !data) return new Set();
    return new Set(
      data
        .map((row) =>
          typeof row.user_id === "string" ? row.user_id : String(row.user_id),
        )
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function filterVisibleChurchMembers<
  T extends { userId?: string; user_id?: string; email?: string | null },
>(
  rows: T[],
  hiddenUserIds?: Set<string>,
): T[] {
  return rows.filter((row) => {
    const userId = row.userId ?? row.user_id;
    if (userId && hiddenUserIds?.has(userId)) return false;
    if (isHiddenPlatformOperatorEmail(row.email)) return false;
    return true;
  });
}

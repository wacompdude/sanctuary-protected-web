import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";

/**
 * Record a successful sign-in against each active organization membership.
 * Uses the caller's Supabase client (browser or server) so auth.uid() matches
 * the session that just signed in — required for audit_logs RLS.
 *
 * Intentionally does not import lib/audit/log.ts (that module re-exports
 * server-only IP helpers and must stay out of the browser bundle).
 */
export async function recordLoginAudit(
  supabase: SupabaseClient,
  options?: { ipAddress?: string | null },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const emailDomain = user.email?.includes("@")
    ? user.email.split("@")[1]?.toLowerCase()
    : null;

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true, nullsFirst: false })
    .limit(20);

  if (membershipError) {
    console.error(
      "recordLoginAudit membership lookup failed:",
      membershipError.message,
    );
  }

  const organizationIds = [
    ...new Set(
      (memberships ?? [])
        .map((row) => row.organization_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const targets =
    organizationIds.length > 0
      ? organizationIds.map((organizationId) => ({ organizationId }))
      : [{ organizationId: null as string | null }];

  for (const target of targets) {
    const ok = await insertLoginRow(supabase, {
      organizationId: target.organizationId,
      userId: user.id,
      emailDomain,
      ipAddress: options?.ipAddress ?? null,
    });

    // If church-scoped insert is blocked (e.g. suspended org), retry as auth-only.
    if (!ok && target.organizationId) {
      await insertLoginRow(supabase, {
        organizationId: null,
        userId: user.id,
        emailDomain,
        ipAddress: options?.ipAddress ?? null,
        metadataExtra: { church_scoped_failed: true },
      });
    }
  }
}

async function insertLoginRow(
  supabase: SupabaseClient,
  input: {
    organizationId: string | null;
    userId: string;
    emailDomain: string | null | undefined;
    ipAddress: string | null;
    metadataExtra?: Record<string, unknown>;
  },
): Promise<boolean> {
  const metadata = sanitizeAuditMetadata({
    email_domain: input.emailDomain ?? null,
    ...(input.metadataExtra ?? {}),
  });

  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    action: AuditAction.AUTH_LOGIN,
    entity_type: AuditEntityType.USER,
    entity_id: input.userId,
    metadata,
    ip_address: input.ipAddress,
  });

  if (error) {
    console.error("recordLoginAudit write failed:", error.message, {
      organizationId: input.organizationId,
    });
    return false;
  }

  return true;
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

/** Record a successful sign-in. Never includes password or tokens. */
export async function recordLoginSecurityEvent(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const ipAddress = await getRequestIpAddress();

  // Prefer logging against the user's oldest active church when available.
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  await writeAuditLog(supabase, {
    organizationId: membership?.organization_id ?? null,
    userId: user.id,
    action: AuditAction.AUTH_LOGIN,
    entityType: AuditEntityType.USER,
    entityId: user.id,
    metadata: {
      email_domain: user.email?.includes("@")
        ? user.email.split("@")[1]?.toLowerCase()
        : null,
    },
    ipAddress,
  }).then(async (result) => {
    // If church-scoped insert is blocked (e.g. suspended church), retry as auth-only.
    if (!result.ok && membership?.organization_id) {
      await writeAuditLog(supabase, {
        organizationId: null,
        userId: user.id,
        action: AuditAction.AUTH_LOGIN,
        entityType: AuditEntityType.USER,
        entityId: user.id,
        metadata: {
          email_domain: user.email?.includes("@")
            ? user.email.split("@")[1]?.toLowerCase()
            : null,
          church_scoped_failed: true,
        },
        ipAddress,
      });
    }
  });
}

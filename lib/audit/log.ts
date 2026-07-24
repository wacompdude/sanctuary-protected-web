import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AuditActionName,
  type AuditEntityTypeName,
} from "@/lib/audit/actions";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";

export type WriteAuditLogInput = {
  churchId?: string | null;
  /** Nullable for trusted system/migration writers. */
  userId?: string | null;
  action: AuditActionName | string;
  entityType?: AuditEntityTypeName | string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

/**
 * Append-only audit writer. Failures are logged but do not throw by default
 * so product flows are not blocked by audit outages.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  input: WriteAuditLogInput,
  options?: { throwOnError?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const metadata = sanitizeAuditMetadata(input.metadata ?? {});

  const { error } = await supabase.from("audit_logs").insert({
    church_id: input.churchId ?? null,
    user_id: input.userId ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata,
    ip_address: input.ipAddress ?? null,
  });

  if (error) {
    console.error("writeAuditLog failed:", error.message, {
      action: input.action,
      churchId: input.churchId,
    });
    if (options?.throwOnError) {
      throw new Error(error.message);
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function getRequestIpAddress(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0]?.trim() || null;
    }
    return headerStore.get("x-real-ip");
  } catch {
    return null;
  }
}

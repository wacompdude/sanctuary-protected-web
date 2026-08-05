import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";
import { getRequestIpAddress } from "@/lib/audit/log";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type WritePlatformAdminActionInput = {
  platformAccountId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  organizationId?: string | null;
  reason?: string | null;
  success?: boolean;
  correlationId?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

/**
 * Append-only platform audit writer. Failures are logged but do not throw
 * by default so product flows are not blocked by audit outages.
 */
export async function writePlatformAdminAction(
  input: WritePlatformAdminActionInput,
  options?: { client?: SupabaseClient; throwOnError?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const metadata = sanitizeAuditMetadata(input.metadata ?? {});
  const client = options?.client ?? requirePlatformAdminClient();
  const ipAddress =
    input.ipAddress === undefined
      ? await getRequestIpAddress()
      : input.ipAddress;

  const { error } = await client.from("platform_admin_actions").insert({
    platform_account_id: input.platformAccountId ?? null,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    organization_id: input.organizationId ?? null,
    reason: input.reason ?? null,
    success: input.success !== false,
    correlation_id: input.correlationId ?? null,
    ip_address: ipAddress,
    user_agent: input.userAgent ?? null,
    metadata,
  });

  if (error) {
    console.error("writePlatformAdminAction failed:", error.message, {
      action: input.action,
    });
    if (options?.throwOnError) {
      throw new Error(error.message);
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

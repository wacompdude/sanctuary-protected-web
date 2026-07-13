import { createClient } from "@/lib/supabase/server";
import { labelForAuditAction } from "@/lib/audit/actions";

export type AuditLogRow = {
  id: string;
  church_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actionLabel: string;
};

export async function listRecentAuditLogs(
  churchId: string,
  limit = 50,
): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, church_id, user_id, action, entity_type, entity_id, metadata, created_at",
    )
    .eq("church_id", churchId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    church_id: (row.church_id as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    action: row.action as string,
    entity_type: (row.entity_type as string | null) ?? null,
    entity_id: (row.entity_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    actionLabel: labelForAuditAction(row.action as string),
  }));
}

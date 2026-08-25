import { createClient } from "@/lib/supabase/server";
import { AuditEntityType, labelForAuditAction } from "@/lib/audit/actions";
import {
  resolveAuditPeopleByIds,
  type AuditPerson,
} from "@/lib/audit/resolve-people";

export type { AuditPerson };

export type AuditLogRow = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actionLabel: string;
  actor: AuditPerson | null;
  entityPerson: AuditPerson | null;
};

export async function listRecentAuditLogs(
  organizationId: string,
  limit = 50,
): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, organization_id, user_id, action, entity_type, entity_id, metadata, created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const userIds: string[] = [];
  for (const row of rows) {
    if (typeof row.user_id === "string") userIds.push(row.user_id);
    if (
      row.entity_type === AuditEntityType.USER &&
      typeof row.entity_id === "string"
    ) {
      userIds.push(row.entity_id);
    }
  }

  const peopleById = await resolveAuditPeopleByIds(userIds);

  return rows.map((row) => {
    const userId = (row.user_id as string | null) ?? null;
    const entityType = (row.entity_type as string | null) ?? null;
    const entityId = (row.entity_id as string | null) ?? null;
    const isUserEntity =
      entityType === AuditEntityType.USER && typeof entityId === "string";

    return {
      id: row.id as string,
      organization_id: (row.organization_id as string | null) ?? null,
      user_id: userId,
      action: row.action as string,
      entity_type: entityType,
      entity_id: entityId,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      actionLabel: labelForAuditAction(row.action as string),
      actor: userId ? (peopleById.get(userId) ?? null) : null,
      entityPerson: isUserEntity ? (peopleById.get(entityId) ?? null) : null,
    };
  });
}

import { AuditAction } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type DemoPlatformAlertSeverity = "info" | "warning" | "critical";

export type DemoPlatformAlert = {
  id: string;
  action: string;
  organization_id: string | null;
  reason: string | null;
  success: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
  severity: DemoPlatformAlertSeverity;
};

const ALERT_ACTIONS = new Set([
  AuditAction.DEMO_RESTORE_FAILED,
  AuditAction.DEMO_RESTORE_ROLLED_BACK,
  AuditAction.DEMO_RESTORE_EMERGENCY_UNLOCK,
  AuditAction.DEMO_RESTORE_LOCK_EXPIRED,
  AuditAction.DEMO_RESTORE_RECOVERY,
  AuditAction.DEMO_RESTORE_MANUAL_ROLLBACK,
]);

function severityForAction(action: string): DemoPlatformAlertSeverity {
  if (
    action === AuditAction.DEMO_RESTORE_FAILED ||
    action === AuditAction.DEMO_RESTORE_EMERGENCY_UNLOCK
  ) {
    return "critical";
  }
  if (
    action === AuditAction.DEMO_RESTORE_LOCK_EXPIRED ||
    action === AuditAction.DEMO_RESTORE_RECOVERY
  ) {
    return "warning";
  }
  return "info";
}

/** Persist a platform-visible demo restore alert (via admin audit stream). */
export async function recordDemoPlatformAlert(params: {
  action: string;
  organizationId: string;
  platformAccountId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  targetId?: string | null;
  success?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await writePlatformAdminAction({
    platformAccountId: params.platformAccountId,
    actorUserId: params.actorUserId,
    action: params.action,
    targetType: "demo_organization",
    targetId: params.targetId ?? params.organizationId,
    organizationId: params.organizationId,
    reason: params.reason,
    success: params.success !== false,
    metadata: {
      alert: true,
      severity: severityForAction(params.action),
      ...(params.metadata ?? {}),
    },
  });
}

export async function listDemoPlatformAlerts(params: {
  organizationId?: string;
  limit?: number;
}): Promise<DemoPlatformAlert[]> {
  const admin = requirePlatformAdminClient();
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);

  let query = admin
    .from("platform_admin_actions")
    .select(
      "id, action, organization_id, reason, success, created_at, metadata",
    )
    .in("action", Array.from(ALERT_ACTIONS))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  }

  const { data, error } = await query;
  if (error) {
    if (/platform_admin_actions|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw error;
  }

  return (data ?? []).map((row) => {
    const action = String(row.action);
    return {
      id: String(row.id),
      action,
      organization_id: (row.organization_id as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
      success: row.success !== false,
      created_at: String(row.created_at),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      severity: severityForAction(action),
    };
  });
}

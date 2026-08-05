import { AuditAction } from "@/lib/audit/actions";
import { recordDemoPlatformAlert } from "@/lib/platform/demo-snapshots/alerts";
import {
  requireDemoOrganization,
} from "@/lib/platform/demo-snapshots/guardrails";
import { emergencyClearRestoreLock } from "@/lib/platform/demo-snapshots/lock-expiry";
import { getActiveRestoreLock } from "@/lib/platform/demo-snapshots/locks";
import {
  DEMO_EMERGENCY_UNLOCK_PHRASE,
  DEMO_RESTORE_CONFIRMATION_PHRASE,
} from "@/lib/platform/demo-snapshots/phrases";
import {
  getDemoRestoreOperationById,
  listDemoRestoreOperations,
} from "@/lib/platform/demo-snapshots/queries";
import { executeDemoOrganizationRestore } from "@/lib/platform/demo-snapshots/restore";
import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type RecoveryStatus = {
  organizationId: string;
  demoRestoreLocked: boolean;
  demoMaintenanceMode: boolean;
  activeLock: {
    id: string;
    expires_at: string;
    expired: boolean;
    operation_id: string | null;
  } | null;
  openOperations: Array<{
    id: string;
    status: string;
    operation_type: string;
    pre_restore_snapshot_id: string | null;
    safe_error_summary: string | null;
    created_at: string;
  }>;
  latestFailedWithSafety: {
    id: string;
    pre_restore_snapshot_id: string;
    safe_error_summary: string | null;
  } | null;
};

export async function getDemoRecoveryStatus(
  organizationId: string,
): Promise<RecoveryStatus> {
  const org = await requireDemoOrganization(organizationId);
  const lock = await getActiveRestoreLock(organizationId);
  const ops = await listDemoRestoreOperations(organizationId, 30);

  const openStatuses = new Set([
    "pending",
    "validating",
    "creating_safety_snapshot",
    "locking",
    "restoring_database",
    "restoring_files",
    "verifying",
    "rolling_back",
    "failed",
  ]);

  const openOperations = ops
    .filter((op) => openStatuses.has(op.status))
    .map((op) => ({
      id: op.id,
      status: op.status,
      operation_type: op.operation_type,
      pre_restore_snapshot_id: op.pre_restore_snapshot_id,
      safe_error_summary: op.safe_error_summary,
      created_at: op.created_at,
    }));

  const latestFailedWithSafety =
    ops.find(
      (op) =>
        (op.status === "failed" || op.status === "rolled_back") &&
        op.pre_restore_snapshot_id,
    ) ?? null;

  const expired = lock
    ? new Date(String(lock.expires_at)).getTime() <= Date.now()
    : false;

  return {
    organizationId: org.id,
    demoRestoreLocked: org.demo_restore_locked,
    demoMaintenanceMode: org.demo_maintenance_mode,
    activeLock: lock
      ? {
          id: String(lock.id),
          expires_at: String(lock.expires_at),
          expired,
          operation_id: (lock.operation_id as string | null) ?? null,
        }
      : null,
    openOperations,
    latestFailedWithSafety: latestFailedWithSafety?.pre_restore_snapshot_id
      ? {
          id: latestFailedWithSafety.id,
          pre_restore_snapshot_id: latestFailedWithSafety.pre_restore_snapshot_id,
          safe_error_summary: latestFailedWithSafety.safe_error_summary,
        }
      : null,
  };
}

export async function executeEmergencyUnlock(params: {
  organizationId: string;
  reason: string;
  confirmationText: string;
  platformAccountId: string;
  actorUserId: string;
}): Promise<void> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new PlatformAccessError(
      "Emergency unlock requires a reason of at least 8 characters.",
      "LOAD_FAILED",
    );
  }
  if (params.confirmationText.trim() !== DEMO_EMERGENCY_UNLOCK_PHRASE) {
    throw new PlatformAccessError(
      `Type ${DEMO_EMERGENCY_UNLOCK_PHRASE} to confirm.`,
      "LOAD_FAILED",
    );
  }

  await requireDemoOrganization(params.organizationId);
  await emergencyClearRestoreLock({ organizationId: params.organizationId });

  const admin = requirePlatformAdminClient();
  await admin
    .from("demo_organization_restore_operations")
    .insert({
      organization_id: params.organizationId,
      // Snapshot required by FK — use a placeholder via nullable? Schema says snapshot_id NOT NULL.
      // Use latest snapshot if any; otherwise we need a workaround.
      snapshot_id: await resolveAnySnapshotId(params.organizationId),
      operation_type: "emergency_unlock",
      status: "completed",
      reason,
      confirmation_text: params.confirmationText.trim(),
      started_by_platform_account_id: params.platformAccountId,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      safe_error_summary: null,
    });

  await recordDemoPlatformAlert({
    action: AuditAction.DEMO_RESTORE_EMERGENCY_UNLOCK,
    organizationId: params.organizationId,
    platformAccountId: params.platformAccountId,
    actorUserId: params.actorUserId,
    reason,
    metadata: { confirmation: "emergency_unlock" },
  });
}

async function resolveAnySnapshotId(organizationId: string): Promise<string> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("demo_organization_snapshots")
    .select("id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new PlatformAccessError(
      "Emergency unlock requires at least one snapshot row for audit linkage. Create a snapshot first.",
      "LOAD_FAILED",
    );
  }
  return String(data.id);
}

export async function executeManualRollback(params: {
  organizationId: string;
  /** Failed/completed restore operation that has a safety snapshot. */
  sourceOperationId: string;
  reason: string;
  confirmationText: string;
  platformAccountId: string;
  actorUserId: string;
}): Promise<{ operationId: string }> {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    throw new PlatformAccessError(
      "A rollback reason of at least 3 characters is required.",
      "LOAD_FAILED",
    );
  }
  if (params.confirmationText.trim() !== DEMO_RESTORE_CONFIRMATION_PHRASE) {
    throw new PlatformAccessError(
      `Type ${DEMO_RESTORE_CONFIRMATION_PHRASE} to confirm.`,
      "LOAD_FAILED",
    );
  }

  const source = await getDemoRestoreOperationById(
    params.organizationId,
    params.sourceOperationId,
  );
  if (!source) {
    throw new PlatformAccessError("Restore operation not found.", "LOAD_FAILED");
  }
  if (!source.pre_restore_snapshot_id) {
    throw new PlatformAccessError(
      "This operation has no safety snapshot to roll back to.",
      "LOAD_FAILED",
    );
  }
  if (!["failed", "completed", "rolled_back"].includes(source.status)) {
    throw new PlatformAccessError(
      "Manual rollback is only allowed for completed, failed, or rolled-back operations.",
      "LOAD_FAILED",
    );
  }

  // Clear stuck lock first so rollback can acquire / run cleanly.
  const lock = await getActiveRestoreLock(params.organizationId);
  if (lock) {
    await emergencyClearRestoreLock({ organizationId: params.organizationId });
  }

  // Re-enable restore eligibility flags if still locked in org row.
  const admin = requirePlatformAdminClient();
  await admin
    .from("organizations")
    .update({
      demo_restore_locked: false,
      demo_maintenance_mode: false,
      demo_restore_enabled: true,
    })
    .eq("id", params.organizationId)
    .eq("is_demo_organization", true);

  const result = await executeDemoOrganizationRestore({
    organizationId: params.organizationId,
    snapshotId: source.pre_restore_snapshot_id,
    reason: `Manual rollback of operation ${source.id}: ${reason}`.slice(0, 2000),
    confirmationText: DEMO_RESTORE_CONFIRMATION_PHRASE,
    platformAccountId: params.platformAccountId,
    skipSafetySnapshot: false,
    operationType: "rollback",
  });

  await admin
    .from("demo_organization_restore_operations")
    .update({
      rollback_snapshot_id: result.operationId,
      rolled_back_at: new Date().toISOString(),
    })
    .eq("id", source.id);

  await recordDemoPlatformAlert({
    action: AuditAction.DEMO_RESTORE_MANUAL_ROLLBACK,
    organizationId: params.organizationId,
    platformAccountId: params.platformAccountId,
    actorUserId: params.actorUserId,
    reason,
    targetId: result.operationId,
    metadata: {
      source_operation_id: source.id,
      safety_snapshot_id: source.pre_restore_snapshot_id,
    },
  });

  return { operationId: result.operationId };
}

/** Mark a stuck non-terminal operation cancelled and clear lock if owned by it. */
export async function recoverFailedRestoreOperation(params: {
  organizationId: string;
  operationId: string;
  reason: string;
  platformAccountId: string;
  actorUserId: string;
  clearLock: boolean;
}): Promise<void> {
  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new PlatformAccessError(
      "Recovery requires a reason of at least 8 characters.",
      "LOAD_FAILED",
    );
  }

  const op = await getDemoRestoreOperationById(
    params.organizationId,
    params.operationId,
  );
  if (!op) {
    throw new PlatformAccessError("Operation not found.", "LOAD_FAILED");
  }

  const recoverable = [
    "pending",
    "validating",
    "creating_safety_snapshot",
    "locking",
    "restoring_database",
    "restoring_files",
    "verifying",
    "rolling_back",
    "failed",
  ];
  if (!recoverable.includes(op.status)) {
    throw new PlatformAccessError(
      `Operation status “${op.status}” does not need recovery.`,
      "LOAD_FAILED",
    );
  }

  const admin = requirePlatformAdminClient();
  await admin
    .from("demo_organization_restore_operations")
    .update({
      status: op.status === "failed" ? "failed" : "cancelled",
      safe_error_summary: [
        op.safe_error_summary,
        `Recovered: ${reason}`,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 2000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", op.id)
    .eq("organization_id", params.organizationId);

  if (params.clearLock) {
    await emergencyClearRestoreLock({ organizationId: params.organizationId });
  }

  await recordDemoPlatformAlert({
    action: AuditAction.DEMO_RESTORE_RECOVERY,
    organizationId: params.organizationId,
    platformAccountId: params.platformAccountId,
    actorUserId: params.actorUserId,
    reason,
    targetId: op.id,
    metadata: {
      previous_status: op.status,
      clear_lock: params.clearLock,
    },
  });
}

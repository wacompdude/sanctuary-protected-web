"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import {
  requirePlatformPermission,
  requireRecentPlatformAuthentication,
} from "@/lib/platform/auth";
import {
  expireAllStaleRestoreLocks,
  expireStaleRestoreLockIfNeeded,
} from "@/lib/platform/demo-snapshots/lock-expiry";
import { recordDemoPlatformAlert } from "@/lib/platform/demo-snapshots/alerts";
import {
  DEMO_EMERGENCY_UNLOCK_PHRASE,
  DEMO_RESTORE_CONFIRMATION_PHRASE,
} from "@/lib/platform/demo-snapshots/phrases";
import {
  executeEmergencyUnlock,
  executeManualRollback,
  recoverFailedRestoreOperation,
} from "@/lib/platform/demo-snapshots/recovery";

export type DemoRecoveryActionState = {
  error?: string;
  success?: string;
};

function revalidateOrg(organizationId: string) {
  revalidatePath(`/platform/demo-organizations/${organizationId}`);
  revalidatePath(
    `/platform/demo-organizations/${organizationId}/restore-history`,
  );
  revalidatePath(`/platform/demo-organizations/${organizationId}/restore`);
  revalidatePath(`/platform/demo-organizations`);
}

export async function emergencyUnlockDemoAction(
  _prev: DemoRecoveryActionState,
  formData: FormData,
): Promise<DemoRecoveryActionState> {
  try {
    await requirePlatformPermission("demo_restores.unlock");
    const ctx = await requireRecentPlatformAuthentication(15 * 60);

    const organizationId = String(formData.get("organization_id") || "").trim();
    const reason = String(formData.get("reason") || "").trim();
    const confirmationText = String(
      formData.get("confirmation_text") || "",
    ).trim();

    if (confirmationText !== DEMO_EMERGENCY_UNLOCK_PHRASE) {
      return {
        error: `Type ${DEMO_EMERGENCY_UNLOCK_PHRASE} exactly to confirm.`,
      };
    }

    await executeEmergencyUnlock({
      organizationId,
      reason,
      confirmationText,
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_RESTORE_EMERGENCY_UNLOCK,
      targetType: "organization",
      targetId: organizationId,
      organizationId,
      reason,
    });

    revalidateOrg(organizationId);
    return { success: "Emergency unlock completed. Maintenance and lock cleared." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Emergency unlock failed.",
    };
  }
}

export async function manualRollbackDemoAction(
  _prev: DemoRecoveryActionState,
  formData: FormData,
): Promise<DemoRecoveryActionState> {
  try {
    await requirePlatformPermission("demo_restores.rollback");
    const ctx = await requireRecentPlatformAuthentication(15 * 60);

    const organizationId = String(formData.get("organization_id") || "").trim();
    const sourceOperationId = String(
      formData.get("source_operation_id") || "",
    ).trim();
    const reason = String(formData.get("reason") || "").trim();
    const confirmationText = String(
      formData.get("confirmation_text") || "",
    ).trim();

    if (confirmationText !== DEMO_RESTORE_CONFIRMATION_PHRASE) {
      return {
        error: `Type ${DEMO_RESTORE_CONFIRMATION_PHRASE} exactly to confirm.`,
      };
    }

    const result = await executeManualRollback({
      organizationId,
      sourceOperationId,
      reason,
      confirmationText,
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
    });

    revalidateOrg(organizationId);
    return {
      success: `Manual rollback completed (operation ${result.operationId.slice(0, 8)}…).`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Manual rollback failed.",
    };
  }
}

export async function recoverFailedOperationAction(
  _prev: DemoRecoveryActionState,
  formData: FormData,
): Promise<DemoRecoveryActionState> {
  try {
    await requirePlatformPermission("demo_restores.unlock");
    const ctx = await requireRecentPlatformAuthentication(15 * 60);

    const organizationId = String(formData.get("organization_id") || "").trim();
    const operationId = String(formData.get("operation_id") || "").trim();
    const reason = String(formData.get("reason") || "").trim();
    const clearLock =
      formData.get("clear_lock") === "on" ||
      formData.get("clear_lock") === "true";

    await recoverFailedRestoreOperation({
      organizationId,
      operationId,
      reason,
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      clearLock,
    });

    revalidateOrg(organizationId);
    return { success: "Failed operation marked recovered." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Recovery failed.",
    };
  }
}

export async function expireStaleLocksAction(
  _prev: DemoRecoveryActionState,
  formData: FormData,
): Promise<DemoRecoveryActionState> {
  try {
    await requirePlatformPermission("demo_organizations.manage");
    const ctx = await requireRecentPlatformAuthentication(15 * 60);
    const organizationId = String(formData.get("organization_id") || "").trim();

    if (organizationId) {
      const result = await expireStaleRestoreLockIfNeeded(organizationId);
      if (result.expired) {
        await recordDemoPlatformAlert({
          action: AuditAction.DEMO_RESTORE_LOCK_EXPIRED,
          organizationId,
          platformAccountId: ctx.account.id,
          actorUserId: ctx.user.id,
          reason: `Manually expired lock ${result.lockId}`,
          targetId: result.lockId,
        });
        revalidateOrg(organizationId);
        return { success: "Expired lock cleared for this demo church." };
      }
      return { success: "No expired lock found for this church." };
    }

    const expired = await expireAllStaleRestoreLocks();
    for (const row of expired) {
      await recordDemoPlatformAlert({
        action: AuditAction.DEMO_RESTORE_LOCK_EXPIRED,
        organizationId: row.organizationId,
        platformAccountId: ctx.account.id,
        actorUserId: ctx.user.id,
        reason: `Batch-expired lock ${row.lockId}`,
        targetId: row.lockId,
      });
      revalidateOrg(row.organizationId);
    }
    return {
      success:
        expired.length === 0
          ? "No stale locks to expire."
          : `Expired ${expired.length} stale lock(s).`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to expire locks.",
    };
  }
}

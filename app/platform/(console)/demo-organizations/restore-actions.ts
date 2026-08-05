"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import {
  requireRecentPlatformAuthentication,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { buildDemoRestoreDryRun } from "@/lib/platform/demo-snapshots/dry-run";
import { DEMO_RESTORE_CONFIRMATION_PHRASE } from "@/lib/platform/demo-snapshots/guardrails";
import { executeDemoOrganizationRestore } from "@/lib/platform/demo-snapshots/restore";

export type DemoRestoreActionState = {
  error?: string;
  success?: string;
  operationId?: string;
  dryRun?: Awaited<ReturnType<typeof buildDemoRestoreDryRun>>;
};

export async function previewDemoRestoreAction(
  _prev: DemoRestoreActionState,
  formData: FormData,
): Promise<DemoRestoreActionState> {
  try {
    await requirePlatformPermission("demo_snapshots.restore");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();
    if (!organizationId || !snapshotId) {
      return { error: "Organization and snapshot are required." };
    }

    const dryRun = await buildDemoRestoreDryRun({
      organizationId,
      snapshotId,
    });
    return { dryRun, success: "Dry-run preview ready. No changes were made." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to preview restore.",
    };
  }
}

export async function executeDemoRestoreAction(
  _prev: DemoRestoreActionState,
  formData: FormData,
): Promise<DemoRestoreActionState> {
  try {
    await requirePlatformPermission("demo_snapshots.restore");
    const ctx = await requireRecentPlatformAuthentication(15 * 60);

    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();
    const reason = String(formData.get("reason") || "").trim();
    const confirmationText = String(
      formData.get("confirmation_text") || "",
    ).trim();

    if (confirmationText !== DEMO_RESTORE_CONFIRMATION_PHRASE) {
      return {
        error: `Type ${DEMO_RESTORE_CONFIRMATION_PHRASE} exactly to confirm.`,
      };
    }

    const result = await executeDemoOrganizationRestore({
      organizationId,
      snapshotId,
      reason,
      confirmationText,
      platformAccountId: ctx.account.id,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_RESTORE_COMPLETED,
      targetType: "demo_organization_restore_operation",
      targetId: result.operationId,
      organizationId,
      reason,
      metadata: {
        snapshot_id: snapshotId,
        pre_restore_snapshot_id: result.preRestoreSnapshotId,
        warning_count: result.warnings.length,
      },
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}`);
    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/restore-history`,
    );

    return {
      success: "Restore completed and verified.",
      operationId: result.operationId,
    };
  } catch (error) {
    try {
      const organizationId = String(formData.get("organization_id") || "").trim();
      if (organizationId) {
        // Best-effort audit of failure when we have context later; ignore here.
        revalidatePath(
          `/platform/demo-organizations/${organizationId}/restore-history`,
        );
      }
    } catch {
      // ignore
    }
    return {
      error: error instanceof Error ? error.message : "Restore failed.",
    };
  }
}

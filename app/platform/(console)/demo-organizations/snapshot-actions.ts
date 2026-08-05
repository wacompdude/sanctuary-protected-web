"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import { createDemoOrganizationSnapshot } from "@/lib/platform/demo-snapshots/create-snapshot";
import { requireDemoOrganization } from "@/lib/platform/demo-snapshots/guardrails";
import {
  archiveDemoSnapshot,
  setDemoSnapshotDefault,
  setDemoSnapshotProtected,
} from "@/lib/platform/demo-snapshots/queries";
import { requirePlatformPermission } from "@/lib/platform/auth";

export type DemoSnapshotActionState = {
  error?: string;
  success?: string;
  snapshotId?: string;
};

export async function createDemoSnapshotAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_snapshots.create");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const versionLabel = String(formData.get("version_label") || "").trim();
    const tagsRaw = String(formData.get("tags") || "").trim();
    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    await requireDemoOrganization(organizationId);

    const result = await createDemoOrganizationSnapshot({
      organizationId,
      name,
      description: description || null,
      versionLabel: versionLabel || null,
      tags,
      platformAccountId: ctx.account.id,
      isAutomatic: false,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_SNAPSHOT_CREATED,
      targetType: "demo_organization_snapshot",
      targetId: result.snapshotId,
      organizationId,
      metadata: {
        slug: result.slug,
        file_count: result.fileCount,
        warning_count: result.warnings.length,
      },
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}`);
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/snapshots`,
    );
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/snapshots/${result.snapshotId}`,
    );

    const warnNote =
      result.warnings.length > 0
        ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})`
        : "";
    return {
      success: `Snapshot created${warnNote}.`,
      snapshotId: result.snapshotId,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to create snapshot.",
    };
  }
}

export async function setDemoSnapshotDefaultAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_snapshots.set_default");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();

    await setDemoSnapshotDefault({ organizationId, snapshotId });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_SNAPSHOT_SET_DEFAULT,
      targetType: "demo_organization_snapshot",
      targetId: snapshotId,
      organizationId,
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/snapshots/${snapshotId}`,
    );
    return { success: "Default snapshot updated." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to set default.",
    };
  }
}

export async function setDemoSnapshotProtectedAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_snapshots.protect");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();
    const isProtected =
      String(formData.get("is_protected") || "") === "true" ||
      formData.get("is_protected") === "on";

    await setDemoSnapshotProtected({
      organizationId,
      snapshotId,
      isProtected,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: isProtected
        ? AuditAction.DEMO_SNAPSHOT_PROTECTED
        : AuditAction.DEMO_SNAPSHOT_UNPROTECTED,
      targetType: "demo_organization_snapshot",
      targetId: snapshotId,
      organizationId,
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/snapshots/${snapshotId}`,
    );
    return {
      success: isProtected
        ? "Snapshot protected."
        : "Snapshot protection removed.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update protection.",
    };
  }
}

export async function archiveDemoSnapshotAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();
    const confirmProtected =
      String(formData.get("confirm_protected") || "").trim() ===
      "ARCHIVE PROTECTED SNAPSHOT";

    const archiveCtx = await requirePlatformPermission("demo_snapshots.archive");

    // Protected archive requires delete permission + typed confirmation.
    let allowProtected = false;
    if (confirmProtected) {
      await requirePlatformPermission("demo_snapshots.delete");
      allowProtected = true;
    }

    await archiveDemoSnapshot({
      organizationId,
      snapshotId,
      allowProtected,
    });

    await writePlatformAdminAction({
      platformAccountId: archiveCtx.account.id,
      actorUserId: archiveCtx.user.id,
      action: AuditAction.DEMO_SNAPSHOT_ARCHIVED,
      targetType: "demo_organization_snapshot",
      targetId: snapshotId,
      organizationId,
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/snapshots/${snapshotId}`,
    );
    return { success: "Snapshot archived." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to archive snapshot.",
    };
  }
}

export async function updateDemoSnapshotMetadataAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_snapshots.create");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const versionLabel = String(formData.get("version_label") || "").trim();
    const tagsRaw = String(formData.get("tags") || "").trim();
    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    const { updateDemoSnapshotMetadata } = await import(
      "@/lib/platform/demo-snapshots/retention"
    );
    await updateDemoSnapshotMetadata({
      organizationId,
      snapshotId,
      name,
      description: description || null,
      versionLabel: versionLabel || null,
      tags,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_SNAPSHOT_METADATA_UPDATED,
      targetType: "demo_organization_snapshot",
      targetId: snapshotId,
      organizationId,
      metadata: { name, version_label: versionLabel, tags },
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    revalidatePath(
      `/platform/demo-organizations/${organizationId}/snapshots/${snapshotId}`,
    );
    return { success: "Snapshot metadata updated." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update metadata.",
    };
  }
}

export async function deleteDemoSnapshotAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_snapshots.delete");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const snapshotId = String(formData.get("snapshot_id") || "").trim();
    const confirmProtected =
      String(formData.get("confirm_protected") || "").trim() ===
      "DELETE PROTECTED SNAPSHOT";

    const { deleteDemoSnapshot } = await import(
      "@/lib/platform/demo-snapshots/retention"
    );
    await deleteDemoSnapshot({
      organizationId,
      snapshotId,
      allowProtected: confirmProtected,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_SNAPSHOT_DELETED,
      targetType: "demo_organization_snapshot",
      targetId: snapshotId,
      organizationId,
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    return { success: "Snapshot deleted (or archived if still referenced)." };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to delete snapshot.",
    };
  }
}

export async function applyDemoSnapshotRetentionAction(
  _prev: DemoSnapshotActionState,
  formData: FormData,
): Promise<DemoSnapshotActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_snapshots.archive");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const daysRaw = String(formData.get("retention_days") || "").trim();
    const retentionDays = daysRaw ? Number(daysRaw) : undefined;

    const { applyDemoSnapshotRetention } = await import(
      "@/lib/platform/demo-snapshots/retention"
    );
    const result = await applyDemoSnapshotRetention({
      organizationId,
      retentionDays:
        retentionDays && Number.isFinite(retentionDays)
          ? retentionDays
          : undefined,
    });

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_SNAPSHOT_RETENTION_APPLIED,
      targetType: "organization",
      targetId: organizationId,
      organizationId,
      metadata: {
        archived_count: result.archived.length,
        evaluated: result.evaluated,
      },
    });

    revalidatePath(`/platform/demo-organizations/${organizationId}/snapshots`);
    return {
      success: `Retention applied: archived ${result.archived.length} of ${result.evaluated} automatic snapshot(s).`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to apply retention.",
    };
  }
}

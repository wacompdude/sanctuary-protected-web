import { DEMO_SAFETY_SNAPSHOT_RETENTION_DAYS_DEFAULT } from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import type { DemoSnapshotRecord } from "@/lib/platform/demo-snapshots/types";
import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import {
  getDemoSnapshotById,
  listDemoSnapshots,
} from "@/lib/platform/demo-snapshots/queries";

export type RetentionApplyResult = {
  evaluated: number;
  archived: string[];
  skipped: Array<{ id: string; reason: string }>;
};

/**
 * Archive automatic/safety snapshots older than retention days.
 * Never archives default or protected snapshots.
 */
export async function applyDemoSnapshotRetention(params: {
  organizationId: string;
  retentionDays?: number;
}): Promise<RetentionApplyResult> {
  const days =
    params.retentionDays ?? DEMO_SAFETY_SNAPSHOT_RETENTION_DAYS_DEFAULT;
  if (days < 1) {
    throw new PlatformAccessError(
      "Retention days must be at least 1.",
      "LOAD_FAILED",
    );
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const snapshots = await listDemoSnapshots(params.organizationId, {
    includeArchived: false,
  });

  const archived: string[] = [];
  const skipped: RetentionApplyResult["skipped"] = [];
  const admin = requirePlatformAdminClient();

  for (const snap of snapshots) {
    if (!snap.is_automatic) {
      skipped.push({ id: snap.id, reason: "not automatic" });
      continue;
    }
    if (snap.is_default) {
      skipped.push({ id: snap.id, reason: "is default" });
      continue;
    }
    if (snap.is_protected) {
      skipped.push({ id: snap.id, reason: "is protected" });
      continue;
    }
    if (new Date(snap.created_at).getTime() >= cutoff) {
      skipped.push({ id: snap.id, reason: "within retention window" });
      continue;
    }

    // Do not archive if referenced by an open/recent restore operation as safety.
    const { count } = await admin
      .from("demo_organization_restore_operations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organizationId)
      .or(
        `pre_restore_snapshot_id.eq.${snap.id},snapshot_id.eq.${snap.id},rollback_snapshot_id.eq.${snap.id}`,
      )
      .in("status", [
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

    if ((count ?? 0) > 0) {
      skipped.push({ id: snap.id, reason: "referenced by active restore op" });
      continue;
    }

    const { error } = await admin
      .from("demo_organization_snapshots")
      .update({
        snapshot_status: "archived",
        archived_at: new Date().toISOString(),
        is_default: false,
      })
      .eq("id", snap.id)
      .eq("organization_id", params.organizationId);

    if (error) {
      skipped.push({ id: snap.id, reason: error.message });
      continue;
    }
    archived.push(snap.id);
  }

  return {
    evaluated: snapshots.filter((s) => s.is_automatic).length,
    archived,
    skipped,
  };
}

export async function deleteDemoSnapshot(params: {
  organizationId: string;
  snapshotId: string;
  allowProtected: boolean;
}): Promise<void> {
  const snapshot = await getDemoSnapshotById(
    params.organizationId,
    params.snapshotId,
  );
  if (!snapshot) {
    throw new PlatformAccessError("Snapshot not found.", "LOAD_FAILED");
  }
  if (snapshot.is_default) {
    throw new PlatformAccessError(
      "Clear the default flag before deleting this snapshot.",
      "LOAD_FAILED",
    );
  }
  if (snapshot.is_protected && !params.allowProtected) {
    throw new PlatformAccessError(
      "Protected snapshots require elevated confirmation to delete.",
      "FORBIDDEN_PERMISSION",
    );
  }

  const admin = requirePlatformAdminClient();

  // Block delete when this is the only ready baseline.
  const ready = await listDemoSnapshots(params.organizationId);
  const readyOthers = ready.filter(
    (s) =>
      s.id !== snapshot.id &&
      s.snapshot_status === "ready" &&
      !s.archived_at &&
      !s.is_automatic,
  );
  if (
    snapshot.snapshot_status === "ready" &&
    !snapshot.is_automatic &&
    readyOthers.length === 0
  ) {
    throw new PlatformAccessError(
      "Cannot delete the only valid baseline snapshot.",
      "LOAD_FAILED",
    );
  }

  const { count } = await admin
    .from("demo_organization_restore_operations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId)
    .or(
      `pre_restore_snapshot_id.eq.${snapshot.id},snapshot_id.eq.${snapshot.id},rollback_snapshot_id.eq.${snapshot.id}`,
    )
    .in("status", [
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

  if ((count ?? 0) > 0) {
    throw new PlatformAccessError(
      "Cannot delete a snapshot required by active restore history.",
      "LOAD_FAILED",
    );
  }

  // Soft-delete via archive if not already; hard metadata delete only when archived.
  if (!snapshot.archived_at) {
    const { error } = await admin
      .from("demo_organization_snapshots")
      .update({
        snapshot_status: "archived",
        archived_at: new Date().toISOString(),
        is_default: false,
      })
      .eq("id", snapshot.id)
      .eq("organization_id", params.organizationId);
    if (error) {
      throw new PlatformAccessError(error.message, "LOAD_FAILED");
    }
    return;
  }

  const { error } = await admin
    .from("demo_organization_snapshots")
    .delete()
    .eq("id", snapshot.id)
    .eq("organization_id", params.organizationId);
  if (error) {
    // Likely FK from restore history — keep archived row.
    throw new PlatformAccessError(
      `Unable to permanently delete snapshot (may be referenced by history): ${error.message}`,
      "LOAD_FAILED",
    );
  }
}

export async function updateDemoSnapshotMetadata(params: {
  organizationId: string;
  snapshotId: string;
  name: string;
  description: string | null;
  versionLabel: string | null;
  tags: string[];
}): Promise<DemoSnapshotRecord> {
  const name = params.name.trim().slice(0, 160);
  if (name.length < 1) {
    throw new PlatformAccessError("Name is required.", "LOAD_FAILED");
  }

  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("demo_organization_snapshots")
    .update({
      name,
      description: params.description,
      version_label: params.versionLabel,
      tags: params.tags.slice(0, 20),
    })
    .eq("id", params.snapshotId)
    .eq("organization_id", params.organizationId)
    .select(
      `id, organization_id, name, slug, description, version_label, tags,
       snapshot_status, snapshot_format_version, database_schema_version,
       subscription_plan_id, subscription_plan_key_snapshot,
       feature_entitlement_snapshot, record_counts, file_count, total_file_size_bytes,
       snapshot_manifest_path, snapshot_data_path, checksum,
       created_by_platform_account_id, created_at, validated_at, last_restored_at,
       is_default, is_protected, is_automatic, archived_at`,
    )
    .single();

  if (error || !data) {
    throw new PlatformAccessError(
      error?.message ?? "Unable to update snapshot metadata.",
      "LOAD_FAILED",
    );
  }

  return data as unknown as DemoSnapshotRecord;
}

import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import type { DemoSnapshotRecord } from "@/lib/platform/demo-snapshots/types";

function mapSnapshot(row: Record<string, unknown>): DemoSnapshotRecord {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    slug: String(row.slug),
    description: (row.description as string | null) ?? null,
    version_label: (row.version_label as string | null) ?? null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    snapshot_status: row.snapshot_status as DemoSnapshotRecord["snapshot_status"],
    snapshot_format_version: Number(row.snapshot_format_version ?? 1),
    database_schema_version: String(row.database_schema_version ?? ""),
    subscription_plan_id: (row.subscription_plan_id as string | null) ?? null,
    subscription_plan_key_snapshot:
      (row.subscription_plan_key_snapshot as string | null) ?? null,
    feature_entitlement_snapshot:
      (row.feature_entitlement_snapshot as Record<string, unknown>) ?? {},
    record_counts: (row.record_counts as Record<string, number>) ?? {},
    file_count: Number(row.file_count ?? 0),
    total_file_size_bytes: Number(row.total_file_size_bytes ?? 0),
    snapshot_manifest_path: (row.snapshot_manifest_path as string | null) ?? null,
    snapshot_data_path: (row.snapshot_data_path as string | null) ?? null,
    checksum: (row.checksum as string | null) ?? null,
    created_by_platform_account_id:
      (row.created_by_platform_account_id as string | null) ?? null,
    created_at: String(row.created_at),
    validated_at: (row.validated_at as string | null) ?? null,
    last_restored_at: (row.last_restored_at as string | null) ?? null,
    is_default: Boolean(row.is_default),
    is_protected: Boolean(row.is_protected),
    is_automatic: Boolean(row.is_automatic),
    archived_at: (row.archived_at as string | null) ?? null,
  };
}

const SNAPSHOT_SELECT = `
  id, organization_id, name, slug, description, version_label, tags,
  snapshot_status, snapshot_format_version, database_schema_version,
  subscription_plan_id, subscription_plan_key_snapshot,
  feature_entitlement_snapshot, record_counts, file_count, total_file_size_bytes,
  snapshot_manifest_path, snapshot_data_path, checksum,
  created_by_platform_account_id, created_at, validated_at, last_restored_at,
  is_default, is_protected, is_automatic, archived_at
`;

function missingTables(message: string): boolean {
  return /demo_organization_snapshots|does not exist|schema cache/i.test(message);
}

export async function listDemoSnapshots(
  organizationId: string,
  options?: { includeArchived?: boolean },
): Promise<DemoSnapshotRecord[]> {
  const admin = requirePlatformAdminClient();
  let query = admin
    .from("demo_organization_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    if (missingTables(error.message)) {
      throw new PlatformAccessError(
        "Demo snapshot tables are not available. Apply migrations 080 and 081.",
        "LOAD_FAILED",
      );
    }
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }
  return (data ?? []).map((row) => mapSnapshot(row as Record<string, unknown>));
}

export async function getDemoSnapshotById(
  organizationId: string,
  snapshotId: string,
): Promise<DemoSnapshotRecord | null> {
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("demo_organization_snapshots")
    .select(SNAPSHOT_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", snapshotId)
    .maybeSingle();

  if (error) {
    if (missingTables(error.message)) {
      throw new PlatformAccessError(
        "Demo snapshot tables are not available. Apply migrations 080 and 081.",
        "LOAD_FAILED",
      );
    }
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }
  if (!data) return null;
  return mapSnapshot(data as Record<string, unknown>);
}

export async function setDemoSnapshotDefault(params: {
  organizationId: string;
  snapshotId: string;
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  const snapshot = await getDemoSnapshotById(
    params.organizationId,
    params.snapshotId,
  );
  if (!snapshot) {
    throw new PlatformAccessError("Snapshot not found.", "LOAD_FAILED");
  }
  if (snapshot.snapshot_status !== "ready" || snapshot.archived_at) {
    throw new PlatformAccessError(
      "Only ready, non-archived snapshots can be default.",
      "LOAD_FAILED",
    );
  }

  const { error: clearError } = await admin
    .from("demo_organization_snapshots")
    .update({ is_default: false })
    .eq("organization_id", params.organizationId)
    .eq("is_default", true);
  if (clearError) {
    throw new PlatformAccessError(clearError.message, "LOAD_FAILED");
  }

  const { error } = await admin
    .from("demo_organization_snapshots")
    .update({ is_default: true })
    .eq("id", params.snapshotId)
    .eq("organization_id", params.organizationId);
  if (error) {
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }
}

export async function setDemoSnapshotProtected(params: {
  organizationId: string;
  snapshotId: string;
  isProtected: boolean;
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  const { error } = await admin
    .from("demo_organization_snapshots")
    .update({ is_protected: params.isProtected })
    .eq("id", params.snapshotId)
    .eq("organization_id", params.organizationId);
  if (error) {
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }
}

export async function archiveDemoSnapshot(params: {
  organizationId: string;
  snapshotId: string;
  allowProtected: boolean;
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  const snapshot = await getDemoSnapshotById(
    params.organizationId,
    params.snapshotId,
  );
  if (!snapshot) {
    throw new PlatformAccessError("Snapshot not found.", "LOAD_FAILED");
  }
  if (snapshot.is_protected && !params.allowProtected) {
    throw new PlatformAccessError(
      "Protected snapshots require elevated permission to archive.",
      "FORBIDDEN_PERMISSION",
    );
  }
  if (snapshot.is_default) {
    throw new PlatformAccessError(
      "Clear the default flag before archiving this snapshot.",
      "LOAD_FAILED",
    );
  }

  const { error } = await admin
    .from("demo_organization_snapshots")
    .update({
      snapshot_status: "archived",
      archived_at: new Date().toISOString(),
      is_default: false,
    })
    .eq("id", params.snapshotId)
    .eq("organization_id", params.organizationId);
  if (error) {
    throw new PlatformAccessError(error.message, "LOAD_FAILED");
  }
}

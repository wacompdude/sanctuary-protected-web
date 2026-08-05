import { DEMO_SNAPSHOT_STORAGE_BUCKET } from "@/lib/platform/demo-snapshots/snapshot-table-registry";

export function snapshotRootPrefix(
  organizationId: string,
  snapshotId: string,
): string {
  return `organizations/${organizationId}/snapshots/${snapshotId}`;
}

export function snapshotManifestObjectPath(
  organizationId: string,
  snapshotId: string,
): string {
  return `${snapshotRootPrefix(organizationId, snapshotId)}/manifest.json`;
}

export function snapshotDataObjectPath(
  organizationId: string,
  snapshotId: string,
): string {
  return `${snapshotRootPrefix(organizationId, snapshotId)}/data.json`;
}

export function snapshotFileObjectPath(
  organizationId: string,
  snapshotId: string,
  sourceBucket: string,
  sourcePath: string,
): string {
  const cleaned = sourcePath.replace(/^\/+/, "");
  return `${snapshotRootPrefix(organizationId, snapshotId)}/files/${sourceBucket}/${cleaned}`;
}

export function snapshotRelativeFilePath(
  sourceBucket: string,
  sourcePath: string,
): string {
  return `files/${sourceBucket}/${sourcePath.replace(/^\/+/, "")}`;
}

export { DEMO_SNAPSHOT_STORAGE_BUCKET };

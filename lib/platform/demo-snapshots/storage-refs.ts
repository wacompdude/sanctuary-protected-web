/**
 * Known Storage path columns for org-scoped snapshot file copies.
 * Bucket must match the live upload target for that column.
 */

export type SnapshotStorageRef = {
  tableName: string;
  column: string;
  bucket: string;
};

export const SNAPSHOT_STORAGE_REFS: SnapshotStorageRef[] = [
  { tableName: "organizations", column: "logo_path", bucket: "church-branding" },
  { tableName: "campuses", column: "logo_path", bucket: "church-branding" },
  {
    tableName: "incident_attachments",
    column: "storage_path",
    bucket: "incident-media",
  },
  {
    tableName: "security_equipment",
    column: "photo_path",
    bucket: "equipment-media",
  },
  {
    tableName: "security_equipment",
    column: "manual_path",
    bucket: "equipment-media",
  },
  {
    tableName: "equipment_maintenance",
    column: "attachment_path",
    bucket: "equipment-media",
  },
  {
    tableName: "equipment_attachments",
    column: "storage_path",
    bucket: "equipment-media",
  },
  {
    tableName: "policy_attachments",
    column: "storage_path",
    bucket: "policy-media",
  },
  {
    tableName: "training_documents",
    column: "storage_path",
    bucket: "training-media",
  },
  {
    tableName: "safety_concern_photos",
    column: "storage_path",
    bucket: "safety-concern-photos",
  },
];

export function storageRefsForTable(tableName: string): SnapshotStorageRef[] {
  return SNAPSHOT_STORAGE_REFS.filter((r) => r.tableName === tableName);
}

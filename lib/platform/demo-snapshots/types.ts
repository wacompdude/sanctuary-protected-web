export type DemoSnapshotStatus =
  | "creating"
  | "validating"
  | "ready"
  | "failed"
  | "invalid"
  | "incompatible"
  | "archived";

export type DemoSnapshotRecord = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string | null;
  version_label: string | null;
  tags: string[];
  snapshot_status: DemoSnapshotStatus;
  snapshot_format_version: number;
  database_schema_version: string;
  subscription_plan_id: string | null;
  subscription_plan_key_snapshot: string | null;
  feature_entitlement_snapshot: Record<string, unknown>;
  record_counts: Record<string, number>;
  file_count: number;
  total_file_size_bytes: number;
  snapshot_manifest_path: string | null;
  snapshot_data_path: string | null;
  checksum: string | null;
  created_by_platform_account_id: string | null;
  created_at: string;
  validated_at: string | null;
  last_restored_at: string | null;
  is_default: boolean;
  is_protected: boolean;
  is_automatic: boolean;
  archived_at: string | null;
};

export type SnapshotFileEntry = {
  source_bucket: string;
  source_path: string;
  snapshot_relative_path: string;
  size_bytes: number;
  sha256: string;
};

export type SnapshotManifest = {
  snapshot_id: string;
  organization_id: string;
  organization_name_snapshot: string;
  created_at: string;
  created_by_platform_account_id: string | null;
  snapshot_format_version: number;
  database_schema_version: string;
  subscription_plan_key: string | null;
  feature_entitlements: Record<string, unknown>;
  included_tables: string[];
  excluded_tables: string[];
  record_counts: Record<string, number>;
  file_count: number;
  total_file_size_bytes: number;
  files: SnapshotFileEntry[];
  checksums: {
    data: string;
    files: Record<string, string>;
  };
  protected_account_ids: string[];
  warnings: string[];
};

export type SnapshotDataPayload = {
  snapshot_id: string;
  organization_id: string;
  tables: Record<string, Record<string, unknown>[]>;
};

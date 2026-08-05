import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Prefixed, stableStringify } from "@/lib/platform/demo-snapshots/checksum";
import {
  DEMO_DATABASE_SCHEMA_VERSION,
  DEMO_SNAPSHOT_FORMAT_VERSION,
  DEMO_SNAPSHOT_STORAGE_BUCKET,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import type {
  SnapshotDataPayload,
  SnapshotManifest,
} from "@/lib/platform/demo-snapshots/types";
import { PlatformAccessError } from "@/lib/platform/errors";

export type SnapshotCompatibility =
  | "compatible"
  | "transform_required"
  | "unsupported"
  | "invalid";

export type LoadedSnapshotArtifacts = {
  manifest: SnapshotManifest;
  data: SnapshotDataPayload;
  compatibility: SnapshotCompatibility;
  warnings: string[];
};

async function downloadJson(
  admin: SupabaseClient,
  path: string,
): Promise<unknown> {
  const { data, error } = await admin.storage
    .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
    .download(path);
  if (error || !data) {
    throw new PlatformAccessError(
      `Unable to download snapshot object ${path}: ${error?.message ?? "missing"}`,
      "LOAD_FAILED",
    );
  }
  const text = await data.text();
  return JSON.parse(text) as unknown;
}

export function assessSnapshotCompatibility(
  manifest: SnapshotManifest,
  organizationId: string,
): { compatibility: SnapshotCompatibility; warnings: string[] } {
  const warnings: string[] = [...(manifest.warnings ?? [])];

  if (!manifest.snapshot_id || !manifest.organization_id) {
    return { compatibility: "invalid", warnings };
  }
  if (manifest.organization_id !== organizationId) {
    warnings.push("Snapshot organization_id does not match target.");
    return { compatibility: "invalid", warnings };
  }
  if (manifest.snapshot_format_version !== DEMO_SNAPSHOT_FORMAT_VERSION) {
    if (manifest.snapshot_format_version > DEMO_SNAPSHOT_FORMAT_VERSION) {
      return { compatibility: "unsupported", warnings };
    }
    warnings.push(
      `Snapshot format ${manifest.snapshot_format_version} differs from current ${DEMO_SNAPSHOT_FORMAT_VERSION}.`,
    );
    return { compatibility: "transform_required", warnings };
  }
  if (manifest.database_schema_version !== DEMO_DATABASE_SCHEMA_VERSION) {
    warnings.push(
      `Schema stamp ${manifest.database_schema_version} vs current ${DEMO_DATABASE_SCHEMA_VERSION}.`,
    );
  }
  return { compatibility: "compatible", warnings };
}

export async function loadSnapshotArtifacts(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    manifestPath: string;
    dataPath: string;
  },
): Promise<LoadedSnapshotArtifacts> {
  const manifestRaw = (await downloadJson(
    admin,
    params.manifestPath,
  )) as SnapshotManifest;
  const dataRaw = (await downloadJson(
    admin,
    params.dataPath,
  )) as SnapshotDataPayload;

  const dataChecksum = sha256Prefixed(stableStringify(dataRaw));
  const warnings: string[] = [];
  if (manifestRaw.checksums?.data && manifestRaw.checksums.data !== dataChecksum) {
    warnings.push("data.json checksum does not match manifest.");
  }

  const assessed = assessSnapshotCompatibility(
    manifestRaw,
    params.organizationId,
  );
  warnings.push(...assessed.warnings);

  if (dataRaw.organization_id !== params.organizationId) {
    throw new PlatformAccessError(
      "Snapshot data organization_id does not match the demo church.",
      "LOAD_FAILED",
    );
  }

  return {
    manifest: manifestRaw,
    data: dataRaw,
    compatibility: assessed.compatibility,
    warnings: Array.from(new Set(warnings)),
  };
}

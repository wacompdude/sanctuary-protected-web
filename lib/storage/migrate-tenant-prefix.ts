/**
 * Move tenant Storage objects from churches/{id}/… → organizations/{id}/…
 * using the Storage move API (not SQL-only metadata updates).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const TENANT_STORAGE_BUCKETS = [
  "church-branding",
  "incident-media",
  "equipment-media",
  "policy-media",
  "safety-concern-photos",
] as const;

const FROM_PREFIX = "churches/";
const TO_PREFIX = "organizations/";

export type StoragePrefixMoveResult = {
  bucket: string;
  fromPath: string;
  toPath: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export type StoragePrefixMigrateSummary = {
  dryRun: boolean;
  listed: number;
  moved: number;
  skipped: number;
  failed: number;
  dbPathsUpdated: number;
  results: StoragePrefixMoveResult[];
};

type DbPathTarget = {
  table: string;
  column: string;
};

const DB_PATH_TARGETS: DbPathTarget[] = [
  { table: "organizations", column: "logo_path" },
  { table: "incident_attachments", column: "storage_path" },
  { table: "equipment_attachments", column: "storage_path" },
  { table: "policy_attachments", column: "storage_path" },
  { table: "safety_concern_photos", column: "storage_path" },
  { table: "equipment", column: "photo_path" },
  { table: "equipment", column: "manual_path" },
  { table: "equipment_maintenance", column: "attachment_path" },
  { table: "campuses", column: "logo_path" },
];

function toOrganizationPath(churchPath: string): string {
  if (!churchPath.startsWith(FROM_PREFIX)) {
    throw new Error(`Expected ${FROM_PREFIX} prefix, got: ${churchPath}`);
  }
  return `${TO_PREFIX}${churchPath.slice(FROM_PREFIX.length)}`;
}

async function listFolder(
  admin: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Array<{ name: string; id: string | null }>> {
  const pageSize = 1000;
  const rows: Array<{ name: string; id: string | null }> = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(path, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      // Missing prefix is fine (no objects under churches/ yet)
      if (/not found|does not exist/i.test(error.message)) return [];
      throw new Error(
        `Failed listing ${bucket}/${path || "(root)"}: ${error.message}`,
      );
    }
    const batch = (data ?? []).map((entry) => ({
      name: entry.name,
      id: entry.id,
    }));
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

/**
 * Recursively list object keys under churches/ via Storage list API
 * (storage schema is not exposed through PostgREST).
 */
async function listChurchPrefixedObjects(
  admin: SupabaseClient,
  buckets: readonly string[],
): Promise<Array<{ bucket_id: string; name: string }>> {
  const rows: Array<{ bucket_id: string; name: string }> = [];

  for (const bucket of buckets) {
    const queue: string[] = ["churches"];

    while (queue.length > 0) {
      const prefix = queue.pop()!;
      const entries = await listFolder(admin, bucket, prefix);

      for (const entry of entries) {
        const fullPath = `${prefix}/${entry.name}`;
        // Folders typically have id === null; files have an id.
        if (entry.id === null) {
          queue.push(fullPath);
          continue;
        }
        rows.push({ bucket_id: bucket, name: fullPath });
      }
    }
  }

  rows.sort((a, b) =>
    a.bucket_id === b.bucket_id
      ? a.name.localeCompare(b.name)
      : a.bucket_id.localeCompare(b.bucket_id),
  );
  return rows;
}

const missingColumns = new Set<string>();

async function updateDbPathsForMove(
  admin: SupabaseClient,
  fromPath: string,
  toPath: string,
): Promise<number> {
  let updated = 0;

  for (const target of DB_PATH_TARGETS) {
    const key = `${target.table}.${target.column}`;
    if (missingColumns.has(key)) continue;

    const { data, error } = await admin
      .from(target.table)
      .update({ [target.column]: toPath })
      .eq(target.column, fromPath)
      .select(target.column);

    if (error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("column") ||
        msg.includes("schema cache") ||
        msg.includes("could not find")
      ) {
        missingColumns.add(key);
      }
      continue;
    }
    updated += data?.length ?? 0;
  }

  return updated;
}

function readStringColumn(row: unknown, column: string): string | null {
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[column];
  return typeof value === "string" ? value : null;
}

async function rewriteLingeringDbPaths(admin: SupabaseClient): Promise<number> {
  let updated = 0;

  for (const target of DB_PATH_TARGETS) {
    const key = `${target.table}.${target.column}`;
    if (missingColumns.has(key)) continue;

    const { data: lingering, error } = await admin
      .from(target.table)
      .select(target.column)
      .like(target.column, `${FROM_PREFIX}%`);

    if (error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes("column") ||
        msg.includes("schema cache") ||
        msg.includes("could not find")
      ) {
        missingColumns.add(key);
      }
      continue;
    }

    for (const row of lingering ?? []) {
      const oldPath = readStringColumn(row, target.column);
      if (!oldPath?.startsWith(FROM_PREFIX)) continue;
      const newPath = toOrganizationPath(oldPath);
      const { error: updateError } = await admin
        .from(target.table)
        .update({ [target.column]: newPath })
        .eq(target.column, oldPath);
      if (!updateError) updated += 1;
    }
  }

  return updated;
}

/**
 * Migrate churches/ → organizations/ for configured buckets.
 * dryRun=true (default) lists planned moves only.
 */
export async function migrateStorageTenantPrefix(
  admin: SupabaseClient,
  options: {
    dryRun?: boolean;
    buckets?: readonly string[];
  } = {},
): Promise<StoragePrefixMigrateSummary> {
  const dryRun = options.dryRun !== false;
  const buckets = options.buckets ?? TENANT_STORAGE_BUCKETS;
  const objects = await listChurchPrefixedObjects(admin, buckets);

  const results: StoragePrefixMoveResult[] = [];
  let moved = 0;
  let skipped = 0;
  let failed = 0;
  let dbPathsUpdated = 0;

  for (const obj of objects) {
    const fromPath = obj.name;
    const toPath = toOrganizationPath(fromPath);
    const bucket = obj.bucket_id;

    if (dryRun) {
      results.push({ bucket, fromPath, toPath, ok: true, skipped: true });
      skipped += 1;
      continue;
    }

    const { error: moveError } = await admin.storage
      .from(bucket)
      .move(fromPath, toPath);

    if (moveError) {
      const msg = moveError.message || String(moveError);
      const destExists = /already exists|duplicate|resource already/i.test(msg);
      const sourceMissing = /not found|does not exist|object not found/i.test(
        msg,
      );

      if (destExists || sourceMissing) {
        const dbCount = await updateDbPathsForMove(admin, fromPath, toPath);
        dbPathsUpdated += dbCount;
        results.push({
          bucket,
          fromPath,
          toPath,
          ok: true,
          skipped: true,
          error: msg,
        });
        skipped += 1;
        continue;
      }

      results.push({ bucket, fromPath, toPath, ok: false, error: msg });
      failed += 1;
      continue;
    }

    const dbCount = await updateDbPathsForMove(admin, fromPath, toPath);
    dbPathsUpdated += dbCount;
    results.push({ bucket, fromPath, toPath, ok: true });
    moved += 1;
  }

  if (!dryRun) {
    dbPathsUpdated += await rewriteLingeringDbPaths(admin);
  }

  return {
    dryRun,
    listed: objects.length,
    moved,
    skipped,
    failed,
    dbPathsUpdated,
    results,
  };
}

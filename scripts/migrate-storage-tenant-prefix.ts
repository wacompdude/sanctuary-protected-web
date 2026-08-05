/**
 * Move Storage objects churches/ → organizations/ via Storage move API.
 *
 * Usage:
 *   npx --yes tsx scripts/migrate-storage-tenant-prefix.ts           # dry-run
 *   npx --yes tsx scripts/migrate-storage-tenant-prefix.ts --execute
 *   npx --yes tsx scripts/migrate-storage-tenant-prefix.ts --execute --bucket=church-branding
 *
 * Requires .env.local (or env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../lib/supabase/admin";
import {
  migrateStorageTenantPrefix,
  TENANT_STORAGE_BUCKETS,
} from "../lib/storage/migrate-tenant-prefix";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv(): void {
  const root = process.cwd();
  loadEnvFile(resolve(root, ".env.local"));
  loadEnvFile(resolve(root, ".env"));
}

function parseArgs(argv: string[]) {
  const execute = argv.includes("--execute");
  const bucketArg = argv.find((a) => a.startsWith("--bucket="));
  const bucket = bucketArg ? bucketArg.slice("--bucket=".length).trim() : null;
  return { execute, bucket };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const { execute, bucket } = parseArgs(process.argv.slice(2));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  const buckets = bucket
    ? [bucket]
    : [...TENANT_STORAGE_BUCKETS];

  if (bucket && !TENANT_STORAGE_BUCKETS.includes(bucket as never)) {
    console.warn(
      `Warning: bucket "${bucket}" is not in the default tenant set; continuing anyway.`,
    );
  }

  const admin = createAdminClient();
  const summary = await migrateStorageTenantPrefix(admin, {
    dryRun: !execute,
    buckets,
  });

  const preview = summary.results.slice(0, 30).map((r) => ({
    bucket: r.bucket,
    from: r.fromPath,
    to: r.toPath,
    ok: r.ok,
    skipped: r.skipped ?? false,
    error: r.error,
  }));

  console.log(
    JSON.stringify(
      {
        mode: summary.dryRun ? "dry-run" : "execute",
        buckets,
        listed: summary.listed,
        moved: summary.moved,
        skipped: summary.skipped,
        failed: summary.failed,
        dbPathsUpdated: summary.dbPathsUpdated,
        preview,
        truncatedPreview: summary.results.length > preview.length,
      },
      null,
      2,
    ),
  );

  if (summary.dryRun) {
    console.log(
      "\nDry-run only. Re-run with --execute to move objects and update DB paths.",
    );
  }

  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

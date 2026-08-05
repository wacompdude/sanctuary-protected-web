import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Prefixed, stableStringify } from "@/lib/platform/demo-snapshots/checksum";
import { exportOrganizationTables } from "@/lib/platform/demo-snapshots/export";
import { requireDemoOrganization } from "@/lib/platform/demo-snapshots/guardrails";
import {
  snapshotDataObjectPath,
  snapshotFileObjectPath,
  snapshotManifestObjectPath,
  snapshotRelativeFilePath,
  snapshotRootPrefix,
} from "@/lib/platform/demo-snapshots/paths";
import {
  DEMO_DATABASE_SCHEMA_VERSION,
  DEMO_SNAPSHOT_FORMAT_VERSION,
  DEMO_SNAPSHOT_STORAGE_BUCKET,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import type {
  SnapshotDataPayload,
  SnapshotFileEntry,
  SnapshotManifest,
} from "@/lib/platform/demo-snapshots/types";
import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type CreateDemoSnapshotInput = {
  organizationId: string;
  name: string;
  description?: string | null;
  versionLabel?: string | null;
  tags?: string[];
  platformAccountId: string;
  isAutomatic?: boolean;
};

export type CreateDemoSnapshotResult = {
  snapshotId: string;
  slug: string;
  warnings: string[];
  fileCount: number;
  recordCounts: Record<string, number>;
};

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return base || "snapshot";
}

async function ensureUniqueSlug(
  admin: SupabaseClient,
  organizationId: string,
  desired: string,
): Promise<string> {
  let candidate = desired;
  for (let i = 0; i < 20; i += 1) {
    const { data, error } = await admin
      .from("demo_organization_snapshots")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("slug", candidate)
      .maybeSingle();
    if (error && /does not exist|schema cache/i.test(error.message)) {
      throw new PlatformAccessError(
        "Demo snapshot tables are not available. Apply migrations 080 and 081.",
        "LOAD_FAILED",
      );
    }
    if (!data) return candidate;
    candidate = `${desired}-${i + 2}`.slice(0, 80);
  }
  return `${desired}-${Date.now().toString(36)}`.slice(0, 80);
}

async function ensureSnapshotBucket(admin: SupabaseClient): Promise<void> {
  const { data: buckets, error: listError } = await admin.storage.listBuckets();
  if (listError) {
    throw new Error(`Unable to list Storage buckets: ${listError.message}`);
  }
  if (buckets?.some((b) => b.name === DEMO_SNAPSHOT_STORAGE_BUCKET)) return;

  const { error } = await admin.storage.createBucket(DEMO_SNAPSHOT_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(
      `Create private bucket “${DEMO_SNAPSHOT_STORAGE_BUCKET}” failed: ${error.message}. Create it in the Supabase dashboard if needed.`,
    );
  }
}

async function removeSnapshotPrefix(
  admin: SupabaseClient,
  organizationId: string,
  snapshotId: string,
): Promise<void> {
  const root = snapshotRootPrefix(organizationId, snapshotId);
  // Best-effort cleanup of known top-level objects + one level of files.
  const toRemove: string[] = [
    snapshotManifestObjectPath(organizationId, snapshotId),
    snapshotDataObjectPath(organizationId, snapshotId),
  ];

  const { data: top } = await admin.storage
    .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
    .list(`${root}/files`, { limit: 100 });

  for (const folder of top ?? []) {
    if (!folder.name) continue;
    const { data: objects } = await admin.storage
      .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
      .list(`${root}/files/${folder.name}`, { limit: 1000 });
    for (const obj of objects ?? []) {
      if (obj.name) {
        // Nested paths need recursive walk; for cleanup use remove on listed paths.
        // list is non-recursive — walk one more level for org prefixes.
        await removeListedRecursive(
          admin,
          `${root}/files/${folder.name}/${obj.name}`,
          toRemove,
        );
      }
    }
  }

  if (toRemove.length > 0) {
    await admin.storage.from(DEMO_SNAPSHOT_STORAGE_BUCKET).remove(toRemove);
  }
}

async function removeListedRecursive(
  admin: SupabaseClient,
  path: string,
  acc: string[],
): Promise<void> {
  const { data } = await admin.storage
    .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
    .list(path, { limit: 1000 });
  if (!data || data.length === 0) {
    acc.push(path);
    return;
  }
  for (const entry of data) {
    if (!entry.name) continue;
    const child = `${path}/${entry.name}`;
    if (entry.id) {
      // File-like entries often have an id in Storage list responses.
      acc.push(child);
    } else {
      await removeListedRecursive(admin, child, acc);
    }
  }
}

async function copyFileToSnapshot(
  admin: SupabaseClient,
  organizationId: string,
  snapshotId: string,
  sourceBucket: string,
  sourcePath: string,
): Promise<SnapshotFileEntry | { warning: string }> {
  const { data, error } = await admin.storage
    .from(sourceBucket)
    .download(sourcePath);
  if (error || !data) {
    return {
      warning: `Missing file ${sourceBucket}/${sourcePath}: ${error?.message ?? "not found"}`,
    };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const destPath = snapshotFileObjectPath(
    organizationId,
    snapshotId,
    sourceBucket,
    sourcePath,
  );

  const { error: uploadError } = await admin.storage
    .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
    .upload(destPath, buffer, {
      contentType: data.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return {
      warning: `Failed to copy ${sourceBucket}/${sourcePath}: ${uploadError.message}`,
    };
  }

  return {
    source_bucket: sourceBucket,
    source_path: sourcePath,
    snapshot_relative_path: snapshotRelativeFilePath(sourceBucket, sourcePath),
    size_bytes: buffer.byteLength,
    sha256: sha256Prefixed(buffer),
  };
}

async function loadSubscriptionSnapshot(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{
  planId: string | null;
  planKey: string | null;
  entitlements: Record<string, unknown>;
}> {
  const { data: sub } = await admin
    .from("organization_subscriptions")
    .select("id, plan_id, status")
    .eq("organization_id", organizationId)
    .in("status", ["trialing", "active", "past_due", "grace_period", "incomplete"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.plan_id) {
    return { planId: null, planKey: null, entitlements: {} };
  }

  const { data: plan } = await admin
    .from("subscription_plans")
    .select("id, plan_key")
    .eq("id", sub.plan_id)
    .maybeSingle();

  const entitlements: Record<string, unknown> = {};
  const { data: overrides } = await admin
    .from("organization_entitlement_overrides")
    .select(
      "feature_id, boolean_value, integer_value, decimal_value, text_value, reason, status, starts_at, expires_at",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("revoked_at", null);

  if (overrides) {
    entitlements.overrides = overrides;
  }

  return {
    planId: String(sub.plan_id),
    planKey: plan?.plan_key ? String(plan.plan_key) : null,
    entitlements,
  };
}

async function loadProtectedAccountIds(
  admin: SupabaseClient,
  organizationId: string,
): Promise<string[]> {
  const { data: protectedRows } = await admin
    .from("demo_protected_accounts")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (protectedRows && protectedRows.length > 0) {
    return protectedRows.map((r) => String(r.user_id));
  }

  // Fallback: active owners / co-owners on the demo org.
  const { data: members } = await admin
    .from("organization_memberships")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("role", ["owner", "co_owner"]);

  return (members ?? [])
    .map((m) => String(m.user_id))
    .filter(Boolean);
}

function validateManifest(
  manifest: SnapshotManifest,
  dataChecksum: string,
): string[] {
  const errors: string[] = [];
  if (!manifest.snapshot_id) errors.push("manifest.snapshot_id missing");
  if (!manifest.organization_id) errors.push("manifest.organization_id missing");
  if (manifest.snapshot_format_version !== DEMO_SNAPSHOT_FORMAT_VERSION) {
    errors.push("unexpected snapshot_format_version");
  }
  if (manifest.checksums.data !== dataChecksum) {
    errors.push("data checksum mismatch");
  }
  if (manifest.file_count !== manifest.files.length) {
    errors.push("file_count does not match files[]");
  }
  return errors;
}

export async function createDemoOrganizationSnapshot(
  input: CreateDemoSnapshotInput,
): Promise<CreateDemoSnapshotResult> {
  const org = await requireDemoOrganization(input.organizationId);
  const admin = requirePlatformAdminClient();
  await ensureSnapshotBucket(admin);

  const name = input.name.trim().slice(0, 160);
  if (name.length < 1) {
    throw new PlatformAccessError("Snapshot name is required.", "LOAD_FAILED");
  }

  const slug = await ensureUniqueSlug(admin, org.id, slugify(name));
  const tags = (input.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

  const { data: inserted, error: insertError } = await admin
    .from("demo_organization_snapshots")
    .insert({
      organization_id: org.id,
      name,
      slug,
      description: input.description?.trim() || null,
      version_label: input.versionLabel?.trim() || null,
      tags,
      snapshot_status: "creating",
      snapshot_format_version: DEMO_SNAPSHOT_FORMAT_VERSION,
      database_schema_version: DEMO_DATABASE_SCHEMA_VERSION,
      created_by_platform_account_id: input.platformAccountId,
      is_automatic: Boolean(input.isAutomatic),
      is_default: false,
      is_protected: false,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new PlatformAccessError(
      insertError?.message ?? "Unable to create snapshot row.",
      "LOAD_FAILED",
    );
  }

  const snapshotId = String(inserted.id);
  const warnings: string[] = [];

  try {
    const exported = await exportOrganizationTables(admin, org.id);
    warnings.push(...exported.warnings);

    const subscription = await loadSubscriptionSnapshot(admin, org.id);
    const protectedAccountIds = await loadProtectedAccountIds(admin, org.id);

    const files: SnapshotFileEntry[] = [];
    for (const [bucket, paths] of exported.fileCandidates) {
      for (const path of paths) {
        const result = await copyFileToSnapshot(
          admin,
          org.id,
          snapshotId,
          bucket,
          path,
        );
        if ("warning" in result) {
          warnings.push(result.warning);
          continue;
        }
        files.push(result);
      }
    }

    const payload: SnapshotDataPayload = {
      snapshot_id: snapshotId,
      organization_id: org.id,
      tables: exported.tables,
    };
    const dataBody = stableStringify(payload);
    const dataChecksum = sha256Prefixed(dataBody);

    const fileChecksums: Record<string, string> = {};
    let totalFileSize = 0;
    for (const file of files) {
      fileChecksums[file.snapshot_relative_path] = file.sha256;
      totalFileSize += file.size_bytes;
    }

    const createdAt = new Date().toISOString();
    const manifest: SnapshotManifest = {
      snapshot_id: snapshotId,
      organization_id: org.id,
      organization_name_snapshot: org.name,
      created_at: createdAt,
      created_by_platform_account_id: input.platformAccountId,
      snapshot_format_version: DEMO_SNAPSHOT_FORMAT_VERSION,
      database_schema_version: DEMO_DATABASE_SCHEMA_VERSION,
      subscription_plan_key: subscription.planKey,
      feature_entitlements: subscription.entitlements,
      included_tables: exported.includedTables,
      excluded_tables: exported.excludedTables,
      record_counts: exported.recordCounts,
      file_count: files.length,
      total_file_size_bytes: totalFileSize,
      files,
      checksums: {
        data: dataChecksum,
        files: fileChecksums,
      },
      protected_account_ids: protectedAccountIds,
      warnings,
    };

    await admin
      .from("demo_organization_snapshots")
      .update({ snapshot_status: "validating" })
      .eq("id", snapshotId);

    const validationErrors = validateManifest(manifest, dataChecksum);
    if (validationErrors.length > 0) {
      throw new Error(`Snapshot validation failed: ${validationErrors.join("; ")}`);
    }

    const manifestPath = snapshotManifestObjectPath(org.id, snapshotId);
    const dataPath = snapshotDataObjectPath(org.id, snapshotId);

    const { error: dataUploadError } = await admin.storage
      .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
      .upload(dataPath, dataBody, {
        contentType: "application/json",
        upsert: true,
      });
    if (dataUploadError) {
      throw new Error(`data.json upload failed: ${dataUploadError.message}`);
    }

    const manifestBody = stableStringify(manifest);
    const { error: manifestUploadError } = await admin.storage
      .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
      .upload(manifestPath, manifestBody, {
        contentType: "application/json",
        upsert: true,
      });
    if (manifestUploadError) {
      throw new Error(
        `manifest.json upload failed: ${manifestUploadError.message}`,
      );
    }

    const overallChecksum = sha256Prefixed(
      `${dataChecksum}|${Object.values(fileChecksums).sort().join("|")}`,
    );

    const { error: readyError } = await admin
      .from("demo_organization_snapshots")
      .update({
        snapshot_status: "ready",
        subscription_plan_id: subscription.planId,
        subscription_plan_key_snapshot: subscription.planKey,
        feature_entitlement_snapshot: subscription.entitlements,
        record_counts: exported.recordCounts,
        file_count: files.length,
        total_file_size_bytes: totalFileSize,
        snapshot_manifest_path: manifestPath,
        snapshot_data_path: dataPath,
        checksum: overallChecksum,
        validated_at: new Date().toISOString(),
      })
      .eq("id", snapshotId);

    if (readyError) {
      throw new Error(readyError.message);
    }

    return {
      snapshotId,
      slug,
      warnings,
      fileCount: files.length,
      recordCounts: exported.recordCounts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Snapshot failed";
    await admin
      .from("demo_organization_snapshots")
      .update({
        snapshot_status: "failed",
        feature_entitlement_snapshot: { failure: message, warnings },
      })
      .eq("id", snapshotId);
    try {
      await removeSnapshotPrefix(admin, org.id, snapshotId);
    } catch {
      // ignore cleanup errors
    }
    throw error instanceof PlatformAccessError
      ? error
      : new PlatformAccessError(message, "LOAD_FAILED");
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createDemoOrganizationSnapshot } from "@/lib/platform/demo-snapshots/create-snapshot";
import { buildDemoRestoreDryRun } from "@/lib/platform/demo-snapshots/dry-run";
import {
  requireDemoOrganization,
  requireDemoRestoreEligible,
  DEMO_RESTORE_CONFIRMATION_PHRASE,
} from "@/lib/platform/demo-snapshots/guardrails";
import { loadSnapshotArtifacts } from "@/lib/platform/demo-snapshots/load-snapshot";
import {
  acquireRestoreLock,
  releaseRestoreLock,
} from "@/lib/platform/demo-snapshots/locks";
import { runWithDemoOperationContext } from "@/lib/platform/demo-snapshots/operation-context";
import {
  snapshotFileObjectPath,
} from "@/lib/platform/demo-snapshots/paths";
import { getDemoSnapshotById } from "@/lib/platform/demo-snapshots/queries";
import {
  DEMO_INTERNAL_BILLING_PROVIDER,
  DEMO_SNAPSHOT_STORAGE_BUCKET,
  deleteOrder,
  exportPayloadOrder,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import type { SnapshotManifest } from "@/lib/platform/demo-snapshots/types";
import { verifyDemoRestore } from "@/lib/platform/demo-snapshots/verify";
import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

const INSERT_BATCH = 200;

export type ExecuteDemoRestoreInput = {
  organizationId: string;
  snapshotId: string;
  reason: string;
  confirmationText: string;
  platformAccountId: string;
  /** Skip automatic safety snapshot (used when rolling back TO a safety snapshot). */
  skipSafetySnapshot?: boolean;
  operationType?: "restore" | "rollback";
};

export type ExecuteDemoRestoreResult = {
  operationId: string;
  preRestoreSnapshotId: string | null;
  verificationOk: boolean;
  warnings: string[];
};

async function updateOperation(
  admin: SupabaseClient,
  operationId: string,
  patch: Record<string, unknown>,
) {
  await admin
    .from("demo_organization_restore_operations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", operationId);
}

function scrubSubscriptionRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...row };
  next.billing_provider = DEMO_INTERNAL_BILLING_PROVIDER;
  for (const key of Object.keys(next)) {
    if (
      /stripe|paddle|provider_customer|provider_subscription|external_customer|external_subscription/i.test(
        key,
      )
    ) {
      next[key] = null;
    }
  }
  return next;
}

function scrubOrganizationRow(
  row: Record<string, unknown>,
  current: {
    is_demo_organization: boolean;
    demo_restore_enabled: boolean;
    demo_restore_locked: boolean;
    demo_maintenance_mode: boolean;
    demo_environment_label: string | null;
    seed_source: string | null;
  },
): Record<string, unknown> {
  return {
    ...row,
    id: current ? row.id : row.id,
    is_demo_organization: true,
    demo_restore_enabled: current.demo_restore_enabled,
    demo_restore_locked: current.demo_restore_locked,
    demo_maintenance_mode: current.demo_maintenance_mode,
    demo_environment_label: current.demo_environment_label,
    seed_source: current.seed_source ?? row.seed_source ?? null,
  };
}

async function deleteOrgScopedTable(
  admin: SupabaseClient,
  tableName: string,
  organizationId: string,
): Promise<number> {
  if (tableName === "organizations") return 0;

  const { data, error } = await admin
    .from(tableName)
    .delete()
    .eq("organization_id", organizationId)
    .select("id");

  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message)) {
      return 0;
    }
    throw new Error(`Delete ${tableName} failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

async function insertRows(
  admin: SupabaseClient,
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await admin.from(tableName).insert(batch);
    if (error) {
      throw new Error(`Insert ${tableName} failed: ${error.message}`);
    }
    inserted += batch.length;
  }
  return inserted;
}

async function restoreDatabaseFromPayload(
  admin: SupabaseClient,
  organizationId: string,
  tables: Record<string, Record<string, unknown>[]>,
  currentOrgFlags: {
    is_demo_organization: boolean;
    demo_restore_enabled: boolean;
    demo_restore_locked: boolean;
    demo_maintenance_mode: boolean;
    demo_environment_label: string | null;
    seed_source: string | null;
  },
): Promise<{ deleted: number; inserted: number; preserved: number }> {
  let deleted = 0;
  let inserted = 0;
  let preserved = 0;

  for (const def of deleteOrder()) {
    deleted += await deleteOrgScopedTable(admin, def.tableName, organizationId);
  }

  // Merge memberships: clear then re-insert from snapshot (Auth users untouched).
  deleted += await deleteOrgScopedTable(
    admin,
    "organization_memberships",
    organizationId,
  );

  // Subscriptions: replace with scrubbed snapshot rows.
  deleted += await deleteOrgScopedTable(
    admin,
    "organization_subscriptions",
    organizationId,
  );

  for (const def of exportPayloadOrder()) {
    const rows = tables[def.tableName] ?? [];
    if (def.tableName === "organizations") {
      const row = rows[0];
      if (!row) {
        throw new Error("Snapshot is missing organizations row.");
      }
      const patched = scrubOrganizationRow(row, currentOrgFlags);
      const { error } = await admin
        .from("organizations")
        .update(patched)
        .eq("id", organizationId);
      if (error) {
        throw new Error(`Update organizations failed: ${error.message}`);
      }
      preserved += 1;
      continue;
    }

    if (def.tableName === "organization_subscriptions") {
      const scrubbed = rows.map(scrubSubscriptionRow);
      inserted += await insertRows(admin, def.tableName, scrubbed);
      continue;
    }

    if (def.restoreStrategy === "merge" || def.restoreStrategy === "replace") {
      inserted += await insertRows(admin, def.tableName, rows);
    }
  }

  return { deleted, inserted, preserved };
}

async function restoreFilesFromManifest(
  admin: SupabaseClient,
  organizationId: string,
  snapshotId: string,
  manifest: SnapshotManifest,
): Promise<{ restored: number; warnings: string[] }> {
  const warnings: string[] = [];
  let restored = 0;

  for (const file of manifest.files ?? []) {
    const snapPath = snapshotFileObjectPath(
      organizationId,
      snapshotId,
      file.source_bucket,
      file.source_path,
    );
    const { data, error } = await admin.storage
      .from(DEMO_SNAPSHOT_STORAGE_BUCKET)
      .download(snapPath);

    if (error || !data) {
      warnings.push(
        `Missing snapshot file ${snapPath}: ${error?.message ?? "not found"}`,
      );
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(file.source_bucket)
      .upload(file.source_path, buffer, {
        contentType: data.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      warnings.push(
        `Failed restoring ${file.source_bucket}/${file.source_path}: ${uploadError.message}`,
      );
      continue;
    }
    restored += 1;
  }

  return { restored, warnings };
}

export async function executeDemoOrganizationRestore(
  input: ExecuteDemoRestoreInput,
): Promise<ExecuteDemoRestoreResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new PlatformAccessError(
      "A restore reason of at least 3 characters is required.",
      "LOAD_FAILED",
    );
  }
  if (input.confirmationText.trim() !== DEMO_RESTORE_CONFIRMATION_PHRASE) {
    throw new PlatformAccessError(
      `Type ${DEMO_RESTORE_CONFIRMATION_PHRASE} to confirm.`,
      "LOAD_FAILED",
    );
  }

  // Eligibility must pass before locking (unless rolling back while locked).
  if (!input.skipSafetySnapshot) {
    await requireDemoRestoreEligible(input.organizationId);
  } else {
    await requireDemoOrganization(input.organizationId);
  }

  const snapshot = await getDemoSnapshotById(
    input.organizationId,
    input.snapshotId,
  );
  if (!snapshot || snapshot.snapshot_status !== "ready" || snapshot.archived_at) {
    throw new PlatformAccessError(
      "Snapshot is not available for restore.",
      "LOAD_FAILED",
    );
  }
  if (!snapshot.snapshot_manifest_path || !snapshot.snapshot_data_path) {
    throw new PlatformAccessError(
      "Snapshot Storage paths are missing.",
      "LOAD_FAILED",
    );
  }

  const admin = requirePlatformAdminClient();
  const dryRun = input.skipSafetySnapshot
    ? {
        blockers: [] as string[],
        warnings: ["Dry-run skipped during rollback."],
      }
    : await buildDemoRestoreDryRun({
        organizationId: input.organizationId,
        snapshotId: input.snapshotId,
      });

  if (dryRun.blockers.length > 0) {
    throw new PlatformAccessError(
      `Restore blocked: ${dryRun.blockers.join("; ")}`,
      "LOAD_FAILED",
    );
  }

  const { data: operation, error: opError } = await admin
    .from("demo_organization_restore_operations")
    .insert({
      organization_id: input.organizationId,
      snapshot_id: input.snapshotId,
      operation_type: input.operationType ?? "restore",
      status: "pending",
      reason,
      confirmation_text: input.confirmationText.trim(),
      dry_run_summary: dryRun,
      started_by_platform_account_id: input.platformAccountId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (opError || !operation) {
    throw new PlatformAccessError(
      opError?.message ?? "Unable to create restore operation.",
      "LOAD_FAILED",
    );
  }

  const operationId = String(operation.id);
  const warnings: string[] = [];
  let preRestoreSnapshotId: string | null = null;
  let lockAcquired = false;
  let dbMutated = false;

  const failAndMaybeRollback = async (message: string) => {
    await updateOperation(admin, operationId, {
      status: "failed",
      safe_error_summary: message.slice(0, 2000),
      completed_at: new Date().toISOString(),
      warnings,
    });

    if (dbMutated && preRestoreSnapshotId && !input.skipSafetySnapshot) {
      await updateOperation(admin, operationId, { status: "rolling_back" });
      try {
        await executeDemoOrganizationRestore({
          organizationId: input.organizationId,
          snapshotId: preRestoreSnapshotId,
          reason: `Automatic rollback after failed restore: ${message}`.slice(
            0,
            2000,
          ),
          confirmationText: DEMO_RESTORE_CONFIRMATION_PHRASE,
          platformAccountId: input.platformAccountId,
          skipSafetySnapshot: true,
          operationType: "rollback",
        });
        await updateOperation(admin, operationId, {
          status: "rolled_back",
          rolled_back_at: new Date().toISOString(),
          rollback_snapshot_id: preRestoreSnapshotId,
        });
      } catch (rollbackError) {
        const detail =
          rollbackError instanceof Error
            ? rollbackError.message
            : "Rollback failed";
        await updateOperation(admin, operationId, {
          status: "failed",
          safe_error_summary: `${message} | rollback failed: ${detail}`.slice(
            0,
            2000,
          ),
        });
        // Keep lock/maintenance for manual recovery.
        throw new PlatformAccessError(
          `Restore failed and automatic rollback failed: ${detail}`,
          "LOAD_FAILED",
        );
      }
    } else if (lockAcquired) {
      await releaseRestoreLock({ organizationId: input.organizationId });
    }

    throw new PlatformAccessError(message, "LOAD_FAILED");
  };

  try {
    return await runWithDemoOperationContext(
      {
        operationContext:
          input.operationType === "rollback" ? "demo_rollback" : "demo_restore",
        organizationId: input.organizationId,
        operationId,
      },
      async () => {
        await updateOperation(admin, operationId, {
          status: "creating_safety_snapshot",
        });

        if (!input.skipSafetySnapshot) {
          const safety = await createDemoOrganizationSnapshot({
            organizationId: input.organizationId,
            name: `Safety before restore ${new Date().toISOString()}`,
            description: `Automatic safety snapshot for operation ${operationId}`,
            versionLabel: "safety",
            tags: ["automatic", "safety"],
            platformAccountId: input.platformAccountId,
            isAutomatic: true,
          });
          preRestoreSnapshotId = safety.snapshotId;
          warnings.push(...safety.warnings);
          await updateOperation(admin, operationId, {
            pre_restore_snapshot_id: preRestoreSnapshotId,
          });
        }

        await updateOperation(admin, operationId, { status: "locking" });
        if (!input.skipSafetySnapshot) {
          await acquireRestoreLock({
            organizationId: input.organizationId,
            platformAccountId: input.platformAccountId,
            operationId,
            ttlMinutes: 90,
          });
          lockAcquired = true;
        } else {
          // Rollback path: ensure maintenance stays on.
          await admin
            .from("organizations")
            .update({
              demo_maintenance_mode: true,
              demo_restore_locked: true,
            })
            .eq("id", input.organizationId);
        }

        await updateOperation(admin, operationId, { status: "validating" });
        const artifacts = await loadSnapshotArtifacts(admin, {
          organizationId: input.organizationId,
          manifestPath: snapshot.snapshot_manifest_path!,
          dataPath: snapshot.snapshot_data_path!,
        });
        warnings.push(...artifacts.warnings);
        if (
          artifacts.compatibility === "invalid" ||
          artifacts.compatibility === "unsupported"
        ) {
          await failAndMaybeRollback(
            `Incompatible snapshot (${artifacts.compatibility})`,
          );
        }

        const { data: currentOrg } = await admin
          .from("organizations")
          .select(
            "is_demo_organization, demo_restore_enabled, demo_restore_locked, demo_maintenance_mode, demo_environment_label, seed_source",
          )
          .eq("id", input.organizationId)
          .single();

        if (!currentOrg?.is_demo_organization) {
          await failAndMaybeRollback("Organization is no longer marked demo.");
        }

        await updateOperation(admin, operationId, {
          status: "restoring_database",
        });
        dbMutated = true;
        const dbStats = await restoreDatabaseFromPayload(
          admin,
          input.organizationId,
          artifacts.data.tables,
          {
            is_demo_organization: true,
            demo_restore_enabled: Boolean(currentOrg?.demo_restore_enabled),
            demo_restore_locked: true,
            demo_maintenance_mode: true,
            demo_environment_label:
              (currentOrg?.demo_environment_label as string | null) ?? null,
            seed_source: (currentOrg?.seed_source as string | null) ?? null,
          },
        );

        await updateOperation(admin, operationId, {
          status: "restoring_files",
          records_deleted: dbStats.deleted,
          records_inserted: dbStats.inserted,
          records_preserved: dbStats.preserved,
        });

        const fileStats = await restoreFilesFromManifest(
          admin,
          input.organizationId,
          input.snapshotId,
          artifacts.manifest,
        );
        warnings.push(...fileStats.warnings);

        await updateOperation(admin, operationId, {
          status: "verifying",
          files_restored: fileStats.restored,
          warnings,
        });

        const verification = await verifyDemoRestore(admin, {
          organizationId: input.organizationId,
          manifest: artifacts.manifest,
        });

        if (!verification.ok) {
          const failed = verification.checks
            .filter((c) => !c.passed)
            .map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`)
            .join("; ");
          await failAndMaybeRollback(`Verification failed: ${failed}`);
        }

        await admin
          .from("demo_organization_snapshots")
          .update({ last_restored_at: new Date().toISOString() })
          .eq("id", input.snapshotId);

        await updateOperation(admin, operationId, {
          status: "completed",
          completed_at: new Date().toISOString(),
          warnings,
        });

        await releaseRestoreLock({ organizationId: input.organizationId });
        lockAcquired = false;

        return {
          operationId,
          preRestoreSnapshotId,
          verificationOk: true,
          warnings,
        };
      },
    );
  } catch (error) {
    if (error instanceof PlatformAccessError) throw error;
    const message = error instanceof Error ? error.message : "Restore failed";
    await failAndMaybeRollback(message);
    throw error;
  }
}

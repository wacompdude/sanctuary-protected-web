import { exportOrganizationTables } from "@/lib/platform/demo-snapshots/export";
import { requireDemoRestoreEligible } from "@/lib/platform/demo-snapshots/guardrails";
import { loadSnapshotArtifacts } from "@/lib/platform/demo-snapshots/load-snapshot";
import { getDemoSnapshotById } from "@/lib/platform/demo-snapshots/queries";
import {
  deleteOrder,
  exportPayloadOrder,
} from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformAdminClient } from "@/lib/platform/queries";

export type DryRunSummary = {
  organization_id: string;
  snapshot_id: string;
  snapshot_name: string;
  compatibility: string;
  current_plan_key: string | null;
  snapshot_plan_key: string | null;
  plan_change: boolean;
  tables_to_delete: Array<{ table: string; current_count: number }>;
  tables_to_insert: Array<{
    table: string;
    current_count: number;
    snapshot_count: number;
    delta: number;
  }>;
  merge_tables: string[];
  preserve_tables: string[];
  excluded_tables: string[];
  file_count_snapshot: number;
  file_count_current_estimate: number;
  protected_account_ids: string[];
  membership_snapshot_count: number;
  membership_current_count: number;
  warnings: string[];
  blockers: string[];
};

export async function buildDemoRestoreDryRun(params: {
  organizationId: string;
  snapshotId: string;
}): Promise<DryRunSummary> {
  const org = await requireDemoRestoreEligible(params.organizationId);
  const snapshot = await getDemoSnapshotById(
    params.organizationId,
    params.snapshotId,
  );
  if (!snapshot) {
    throw new PlatformAccessError("Snapshot not found.", "LOAD_FAILED");
  }
  if (snapshot.snapshot_status !== "ready" || snapshot.archived_at) {
    throw new PlatformAccessError(
      "Only ready, non-archived snapshots can be restored.",
      "LOAD_FAILED",
    );
  }
  if (!snapshot.snapshot_manifest_path || !snapshot.snapshot_data_path) {
    throw new PlatformAccessError(
      "Snapshot is missing Storage paths.",
      "LOAD_FAILED",
    );
  }

  const admin = requirePlatformAdminClient();
  const artifacts = await loadSnapshotArtifacts(admin, {
    organizationId: org.id,
    manifestPath: snapshot.snapshot_manifest_path,
    dataPath: snapshot.snapshot_data_path,
  });

  const blockers: string[] = [];
  if (
    artifacts.compatibility === "invalid" ||
    artifacts.compatibility === "unsupported"
  ) {
    blockers.push(`Snapshot compatibility: ${artifacts.compatibility}`);
  }

  const current = await exportOrganizationTables(admin, org.id);

  const { data: currentSub } = await admin
    .from("organization_subscriptions")
    .select("plan_id, subscription_plans(plan_key)")
    .eq("organization_id", org.id)
    .in("status", ["trialing", "active", "past_due", "grace_period", "incomplete"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planJoin = currentSub?.subscription_plans as
    | { plan_key?: string }
    | { plan_key?: string }[]
    | null;
  const currentPlanKey = Array.isArray(planJoin)
    ? planJoin[0]?.plan_key ?? null
    : planJoin?.plan_key ?? null;

  const tablesToDelete: DryRunSummary["tables_to_delete"] = [];
  for (const def of deleteOrder()) {
    tablesToDelete.push({
      table: def.tableName,
      current_count: current.recordCounts[def.tableName] ?? 0,
    });
  }

  const tablesToInsert: DryRunSummary["tables_to_insert"] = [];
  for (const def of exportPayloadOrder()) {
    if (def.restoreStrategy !== "replace" && def.restoreStrategy !== "merge") {
      continue;
    }
    const snapshotCount =
      artifacts.data.tables[def.tableName]?.length ??
      artifacts.manifest.record_counts[def.tableName] ??
      0;
    const currentCount = current.recordCounts[def.tableName] ?? 0;
    tablesToInsert.push({
      table: def.tableName,
      current_count: currentCount,
      snapshot_count: snapshotCount,
      delta: snapshotCount - currentCount,
    });
  }

  let fileEstimate = 0;
  for (const set of current.fileCandidates.values()) {
    fileEstimate += set.size;
  }

  return {
    organization_id: org.id,
    snapshot_id: snapshot.id,
    snapshot_name: snapshot.name,
    compatibility: artifacts.compatibility,
    current_plan_key: currentPlanKey,
    snapshot_plan_key: artifacts.manifest.subscription_plan_key,
    plan_change: currentPlanKey !== artifacts.manifest.subscription_plan_key,
    tables_to_delete: tablesToDelete,
    tables_to_insert: tablesToInsert,
    merge_tables: exportPayloadOrder()
      .filter((t) => t.restoreStrategy === "merge")
      .map((t) => t.tableName),
    preserve_tables: ["profiles", "demo_seed_records"],
    excluded_tables: artifacts.manifest.excluded_tables,
    file_count_snapshot: artifacts.manifest.file_count,
    file_count_current_estimate: fileEstimate,
    protected_account_ids: artifacts.manifest.protected_account_ids ?? [],
    membership_snapshot_count:
      artifacts.data.tables.organization_memberships?.length ?? 0,
    membership_current_count:
      current.recordCounts.organization_memberships ?? 0,
    warnings: [...artifacts.warnings, ...current.warnings],
    blockers,
  };
}

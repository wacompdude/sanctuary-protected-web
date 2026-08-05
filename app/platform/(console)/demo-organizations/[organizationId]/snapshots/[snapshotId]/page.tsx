import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoSnapshotControls } from "@/components/platform/demo-snapshot-forms";
import {
  DemoSnapshotDeleteForm,
  DemoSnapshotMetadataForm,
  SnapshotFeatureSummaryList,
} from "@/components/platform/demo-snapshot-versioning-forms";
import {
  hasPlatformPermission,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { getDemoOrganizationById } from "@/lib/platform/demo-snapshots/guardrails";
import { getDemoSnapshotById } from "@/lib/platform/demo-snapshots/queries";
import {
  buildSnapshotFeatureSummary,
  tierBadgeLabel,
} from "@/lib/platform/demo-snapshots/versioning";

export default async function DemoSnapshotDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string; snapshotId: string }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId, snapshotId } = await params;
  const canSetDefault = await hasPlatformPermission(
    "demo_snapshots.set_default",
  ).catch(() => false);
  const canProtect = await hasPlatformPermission("demo_snapshots.protect").catch(
    () => false,
  );
  const canArchive = await hasPlatformPermission("demo_snapshots.archive").catch(
    () => false,
  );
  const canDelete = await hasPlatformPermission("demo_snapshots.delete").catch(
    () => false,
  );
  const canEditMeta = await hasPlatformPermission("demo_snapshots.create").catch(
    () => false,
  );

  let org: Awaited<ReturnType<typeof getDemoOrganizationById>> = null;
  let snapshot: Awaited<ReturnType<typeof getDemoSnapshotById>> = null;
  let loadError: string | null = null;

  try {
    org = await getDemoOrganizationById(organizationId);
    if (org?.is_demo_organization) {
      snapshot = await getDemoSnapshotById(organizationId, snapshotId);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load.";
  }

  if (!loadError && (!org || !org.is_demo_organization || !snapshot)) {
    notFound();
  }

  const recordCounts = snapshot?.record_counts ?? {};
  const topTables = Object.entries(recordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  const featureSummary = snapshot
    ? buildSnapshotFeatureSummary(snapshot)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/demo-organizations/${organizationId}/snapshots`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← Snapshots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {snapshot?.name ?? "Snapshot"}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {snapshot?.version_label ? (
            <span className="rounded border border-slate-700 px-2 py-0.5 text-slate-300">
              {snapshot.version_label}
            </span>
          ) : null}
          {snapshot ? (
            <span className="rounded border border-sky-900/50 bg-sky-950/40 px-2 py-0.5 text-sky-100">
              {tierBadgeLabel(snapshot.subscription_plan_key_snapshot)}
            </span>
          ) : null}
          {snapshot?.is_default ? (
            <span className="text-emerald-400">default reset</span>
          ) : null}
          {snapshot?.is_protected ? (
            <span className="text-amber-300">protected</span>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-xs text-slate-500">{snapshotId}</p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-slate-400">Status</div>
              <div className="font-medium text-slate-100">
                {snapshot.snapshot_status}
                {snapshot.is_automatic ? " · automatic" : ""}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Records / files</div>
              <div className="text-slate-100">
                {featureSummary?.totalRecords ?? 0} records · {snapshot.file_count}{" "}
                files ({Math.round(snapshot.total_file_size_bytes / 1024)} KB)
              </div>
            </div>
            <div>
              <div className="text-slate-400">Schema / format</div>
              <div className="font-mono text-xs text-slate-200">
                db {snapshot.database_schema_version} · format{" "}
                {snapshot.snapshot_format_version}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Last restored</div>
              <div className="text-slate-200">
                {snapshot.last_restored_at
                  ? new Date(snapshot.last_restored_at).toLocaleString()
                  : "Never"}
              </div>
            </div>
            {snapshot.description ? (
              <div className="md:col-span-2">
                <div className="text-slate-400">Description</div>
                <div className="text-slate-200">{snapshot.description}</div>
              </div>
            ) : null}
            {snapshot.tags.length > 0 ? (
              <div className="md:col-span-2">
                <div className="text-slate-400">Tags</div>
                <div className="text-slate-200">
                  {snapshot.tags.map((t) => `#${t}`).join(" ")}
                </div>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <div className="text-slate-400">Checksum</div>
              <div className="break-all font-mono text-xs text-slate-400">
                {snapshot.checksum ?? "—"}
              </div>
            </div>
          </div>

          {featureSummary ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <h2 className="text-sm font-semibold text-slate-100">
                Feature summary
              </h2>
              <div className="mt-3">
                <SnapshotFeatureSummaryList summary={featureSummary} />
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Record counts
            </h2>
            {topTables.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No counts recorded.</p>
            ) : (
              <ul className="mt-3 grid gap-1 text-sm text-slate-300 sm:grid-cols-2">
                {topTables.map(([table, count]) => (
                  <li key={table} className="flex justify-between gap-3">
                    <span className="font-mono text-xs text-slate-400">
                      {table}
                    </span>
                    <span>{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEditMeta ? <DemoSnapshotMetadataForm snapshot={snapshot} /> : null}

          <DemoSnapshotControls
            snapshot={snapshot}
            canSetDefault={canSetDefault}
            canProtect={canProtect}
            canArchive={canArchive}
          />

          {canDelete ? <DemoSnapshotDeleteForm snapshot={snapshot} /> : null}

          {snapshot.snapshot_status === "ready" && !snapshot.archived_at ? (
            <div>
              <Link
                href={`/platform/demo-organizations/${organizationId}/restore?snapshotId=${snapshot.id}`}
                className="text-sm text-sky-300 hover:text-sky-200"
              >
                Restore this snapshot →
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

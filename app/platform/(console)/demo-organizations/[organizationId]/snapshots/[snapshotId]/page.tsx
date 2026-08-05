import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoSnapshotControls } from "@/components/platform/demo-snapshot-forms";
import {
  hasPlatformPermission,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { getDemoOrganizationById } from "@/lib/platform/demo-snapshots/guardrails";
import { getDemoSnapshotById } from "@/lib/platform/demo-snapshots/queries";

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
                {snapshot.is_default ? " · default" : ""}
                {snapshot.is_protected ? " · protected" : ""}
                {snapshot.is_automatic ? " · automatic" : ""}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Plan snapshot</div>
              <div className="font-mono text-xs text-slate-200">
                {snapshot.subscription_plan_key_snapshot ?? "—"}
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
              <div className="text-slate-400">Files</div>
              <div className="text-slate-100">
                {snapshot.file_count} (
                {Math.round(snapshot.total_file_size_bytes / 1024)} KB)
              </div>
            </div>
            <div>
              <div className="text-slate-400">Checksum</div>
              <div className="break-all font-mono text-xs text-slate-400">
                {snapshot.checksum ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Validated</div>
              <div className="text-slate-200">
                {snapshot.validated_at
                  ? new Date(snapshot.validated_at).toLocaleString()
                  : "—"}
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
                <div className="text-slate-200">{snapshot.tags.join(", ")}</div>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <div className="text-slate-400">Storage paths</div>
              <div className="mt-1 space-y-1 font-mono text-xs text-slate-500">
                <div>{snapshot.snapshot_manifest_path ?? "—"}</div>
                <div>{snapshot.snapshot_data_path ?? "—"}</div>
              </div>
            </div>
          </div>

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

          <DemoSnapshotControls
            snapshot={snapshot}
            canSetDefault={canSetDefault}
            canProtect={canProtect}
            canArchive={canArchive}
          />

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

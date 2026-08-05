import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoSnapshotRetentionForm } from "@/components/platform/demo-snapshot-versioning-forms";
import {
  hasPlatformPermission,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { getDemoOrganizationById } from "@/lib/platform/demo-snapshots/guardrails";
import { listDemoSnapshots } from "@/lib/platform/demo-snapshots/queries";
import { DEMO_SAFETY_SNAPSHOT_RETENTION_DAYS_DEFAULT } from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import {
  buildSnapshotFeatureSummary,
  filterDemoSnapshots,
  tierBadgeLabel,
  uniqueSnapshotPlans,
  uniqueSnapshotTags,
} from "@/lib/platform/demo-snapshots/versioning";

export const maxDuration = 60;

export default async function DemoSnapshotsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    plan?: string;
    tag?: string;
    default?: string;
    protected?: string;
    automatic?: string;
    archived?: string;
  }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
  const sp = await searchParams;
  const canCreate = await hasPlatformPermission("demo_snapshots.create").catch(
    () => false,
  );
  const canArchive = await hasPlatformPermission("demo_snapshots.archive").catch(
    () => false,
  );

  let org: Awaited<ReturnType<typeof getDemoOrganizationById>> = null;
  let snapshots: Awaited<ReturnType<typeof listDemoSnapshots>> = [];
  let loadError: string | null = null;

  try {
    org = await getDemoOrganizationById(organizationId);
    if (org?.is_demo_organization) {
      snapshots = await listDemoSnapshots(organizationId, {
        includeArchived: sp.archived === "1",
      });
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load.";
  }

  if (!loadError && (!org || !org.is_demo_organization)) {
    notFound();
  }

  const filtered = filterDemoSnapshots(snapshots, {
    q: sp.q,
    status: sp.status,
    plan: sp.plan,
    tag: sp.tag,
    onlyDefault: sp.default === "1",
    onlyProtected: sp.protected === "1",
    onlyAutomatic: sp.automatic === "1",
    includeArchived: sp.archived === "1",
  });

  const tags = uniqueSnapshotTags(snapshots);
  const plans = uniqueSnapshotPlans(snapshots);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/platform/demo-organizations/${organizationId}`}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← {org?.name ?? "Demo church"}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Snapshots
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Named, versioned backups with tier badges, tags, and feature
            summaries.
          </p>
        </div>
        {canCreate ? (
          <Link
            href={`/platform/demo-organizations/${organizationId}/snapshots/new`}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white"
          >
            New snapshot
          </Link>
        ) : null}
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}

      <form
        method="get"
        className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 md:grid-cols-4"
      >
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-slate-400">Search</span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name, version, tag, plan…"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Status</span>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">Any</option>
            <option value="ready">ready</option>
            <option value="failed">failed</option>
            <option value="creating">creating</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Plan</span>
          <select
            name="plan"
            defaultValue={sp.plan ?? ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">Any</option>
            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {tierBadgeLabel(plan)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Tag</span>
          <select
            name="tag"
            defaultValue={sp.tag ?? ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">Any</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" name="default" value="1" defaultChecked={sp.default === "1"} />
          Default only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            name="protected"
            value="1"
            defaultChecked={sp.protected === "1"}
          />
          Protected only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            name="automatic"
            value="1"
            defaultChecked={sp.automatic === "1"}
          />
          Automatic only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={sp.archived === "1"}
          />
          Include archived
        </label>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900"
          >
            Apply filters
          </button>
        </div>
      </form>

      {canArchive ? (
        <DemoSnapshotRetentionForm
          organizationId={organizationId}
          defaultDays={DEMO_SAFETY_SNAPSHOT_RETENTION_DAYS_DEFAULT}
        />
      ) : null}

      {filtered.length === 0 && !loadError ? (
        <p className="text-sm text-slate-400">
          No snapshots match these filters.
        </p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name / version</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                <th className="px-3 py-2 font-medium">Features</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((snap) => {
                const summary = buildSnapshotFeatureSummary(snap);
                return (
                  <tr
                    key={snap.id}
                    className="border-t border-slate-800/80 text-slate-200 align-top"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/platform/demo-organizations/${organizationId}/snapshots/${snap.id}`}
                        className="font-medium text-sky-300 hover:text-sky-200"
                      >
                        {snap.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                        {snap.version_label ? (
                          <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300">
                            {snap.version_label}
                          </span>
                        ) : null}
                        <span className="font-mono">{snap.slug}</span>
                        {snap.is_default ? (
                          <span className="text-emerald-400">default</span>
                        ) : null}
                        {snap.is_protected ? (
                          <span className="text-amber-300">protected</span>
                        ) : null}
                        {snap.is_automatic ? (
                          <span className="text-slate-400">automatic</span>
                        ) : null}
                        {snap.tags.map((tag) => (
                          <span key={tag} className="text-slate-500">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded border border-sky-900/50 bg-sky-950/40 px-2 py-0.5 text-xs text-sky-100">
                        {tierBadgeLabel(snap.subscription_plan_key_snapshot)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      <div>{summary.totalRecords} records</div>
                      <div className="mt-1 line-clamp-2">
                        {summary.labels.slice(0, 3).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{snap.snapshot_status}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {snap.file_count} files
                      <div className="text-xs">
                        {Math.round(snap.total_file_size_bytes / 1024)} KB
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {new Date(snap.created_at).toLocaleString()}
                      {snap.last_restored_at ? (
                        <div className="text-xs">
                          Restored{" "}
                          {new Date(snap.last_restored_at).toLocaleDateString()}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

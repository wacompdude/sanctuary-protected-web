import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformPermission, hasPlatformPermission } from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { getDemoOrganizationById } from "@/lib/platform/demo-snapshots/guardrails";
import { listDemoSnapshots } from "@/lib/platform/demo-snapshots/queries";

export const maxDuration = 60;

export default async function DemoSnapshotsListPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
  const canCreate = await hasPlatformPermission("demo_snapshots.create").catch(
    () => false,
  );

  let org: Awaited<ReturnType<typeof getDemoOrganizationById>> = null;
  let snapshots: Awaited<ReturnType<typeof listDemoSnapshots>> = [];
  let loadError: string | null = null;

  try {
    org = await getDemoOrganizationById(organizationId);
    if (org?.is_demo_organization) {
      snapshots = await listDemoSnapshots(organizationId);
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load.";
  }

  if (!loadError && (!org || !org.is_demo_organization)) {
    notFound();
  }

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
            Named, versioned backups of this demo church.
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

      {snapshots.length === 0 && !loadError ? (
        <p className="text-sm text-slate-400">
          No snapshots yet. Create a named version to capture the current demo
          state.
        </p>
      ) : null}

      {snapshots.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Files</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap) => (
                <tr
                  key={snap.id}
                  className="border-t border-slate-800/80 text-slate-200"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/demo-organizations/${organizationId}/snapshots/${snap.id}`}
                      className="font-medium text-sky-300 hover:text-sky-200"
                    >
                      {snap.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="font-mono">{snap.slug}</span>
                      {snap.version_label ? (
                        <span>{snap.version_label}</span>
                      ) : null}
                      {snap.is_default ? (
                        <span className="text-emerald-400">default</span>
                      ) : null}
                      {snap.is_protected ? (
                        <span className="text-amber-300">protected</span>
                      ) : null}
                      {snap.is_automatic ? (
                        <span className="text-slate-400">automatic</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">{snap.snapshot_status}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {snap.subscription_plan_key_snapshot ?? "—"}
                  </td>
                  <td className="px-3 py-2">{snap.file_count}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {new Date(snap.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

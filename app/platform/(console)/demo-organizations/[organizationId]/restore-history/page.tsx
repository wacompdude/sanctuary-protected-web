import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoRecoveryPanel } from "@/components/platform/demo-recovery-panel";
import {
  hasPlatformPermission,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { rethrowOrRedirectForPlatformAccess } from "@/lib/platform/access-guard";
import { listDemoPlatformAlerts } from "@/lib/platform/demo-snapshots/alerts";
import { getDemoOrganizationById } from "@/lib/platform/demo-snapshots/guardrails";
import { getDemoRecoveryStatus } from "@/lib/platform/demo-snapshots/recovery";
import { listDemoRestoreOperations } from "@/lib/platform/demo-snapshots/queries";

export const maxDuration = 300;

export default async function DemoRestoreHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
  const sp = await searchParams;
  const canUnlock = await hasPlatformPermission("demo_restores.unlock").catch(
    () => false,
  );
  const canRollback = await hasPlatformPermission(
    "demo_restores.rollback",
  ).catch(() => false);
  const canManage = await hasPlatformPermission(
    "demo_organizations.manage",
  ).catch(() => false);

  let org: Awaited<ReturnType<typeof getDemoOrganizationById>> = null;
  let ops: Awaited<ReturnType<typeof listDemoRestoreOperations>> = [];
  let recovery: Awaited<ReturnType<typeof getDemoRecoveryStatus>> | null = null;
  let alerts: Awaited<ReturnType<typeof listDemoPlatformAlerts>> = [];
  let loadError: string | null = null;

  try {
    org = await getDemoOrganizationById(organizationId);
    if (org?.is_demo_organization) {
      ops = await listDemoRestoreOperations(organizationId, 100);
      recovery = await getDemoRecoveryStatus(organizationId);
      alerts = await listDemoPlatformAlerts({
        organizationId,
        limit: 15,
      });
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load.";
  }

  if (!loadError && (!org || !org.is_demo_organization)) {
    notFound();
  }

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = ops.filter((op) => {
    if (sp.status && op.status !== sp.status) return false;
    if (sp.type && op.operation_type !== sp.type) return false;
    if (q) {
      const hay = `${op.reason} ${op.status} ${op.operation_type} ${op.safe_error_summary ?? ""} ${op.id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/demo-organizations/${organizationId}`}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          ← {org?.name ?? "Demo church"}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Restore history &amp; recovery
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Operation history, manual rollback, emergency unlock, and lock
          recovery.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}

      {recovery ? (
        <DemoRecoveryPanel
          organizationId={organizationId}
          status={recovery}
          alerts={alerts}
          canUnlock={canUnlock}
          canRollback={canRollback}
          canManage={canManage}
        />
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
            placeholder="Reason, status, operation id…"
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
            <option value="completed">completed</option>
            <option value="failed">failed</option>
            <option value="rolled_back">rolled_back</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Type</span>
          <select
            name="type"
            defaultValue={sp.type ?? ""}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">Any</option>
            <option value="restore">restore</option>
            <option value="rollback">rollback</option>
            <option value="emergency_unlock">emergency_unlock</option>
          </select>
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

      {filtered.length === 0 && !loadError ? (
        <p className="text-sm text-slate-400">No restore operations match.</p>
      ) : null}

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Records</th>
                <th className="px-3 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((op) => (
                <tr
                  key={op.id}
                  className="border-t border-slate-800/80 align-top text-slate-200"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    {new Date(op.created_at).toLocaleString()}
                    <div className="font-mono text-[10px] text-slate-600">
                      {op.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-3 py-2">{op.operation_type}</td>
                  <td className="px-3 py-2">
                    {op.status}
                    {op.safe_error_summary ? (
                      <div className="mt-1 max-w-xs text-xs text-rose-300">
                        {op.safe_error_summary}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    −{op.records_deleted} / +{op.records_inserted} / keep{" "}
                    {op.records_preserved}
                    <div>files {op.files_restored}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-300">
                    <div className="max-w-sm">{op.reason}</div>
                    {op.pre_restore_snapshot_id ? (
                      <Link
                        href={`/platform/demo-organizations/${organizationId}/snapshots/${op.pre_restore_snapshot_id}`}
                        className="mt-1 inline-block text-xs text-sky-300 hover:text-sky-200"
                      >
                        Safety snapshot
                      </Link>
                    ) : null}
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

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
}: {
  params: Promise<{ organizationId: string }>;
}) {
  try {
    await requirePlatformPermission("demo_snapshots.read");
  } catch (error) {
    rethrowOrRedirectForPlatformAccess(error);
  }

  const { organizationId } = await params;
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
      ops = await listDemoRestoreOperations(organizationId);
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
          Operation history, manual rollback, emergency unlock, and lock recovery.
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

      {ops.length === 0 && !loadError ? (
        <p className="text-sm text-slate-400">No restore operations yet.</p>
      ) : null}

      {ops.length > 0 ? (
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
              {ops.map((op) => (
                <tr
                  key={op.id}
                  className="border-t border-slate-800/80 text-slate-200 align-top"
                >
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
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

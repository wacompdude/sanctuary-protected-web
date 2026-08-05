import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { PlatformSupportWorkspacePanel } from "@/components/platform/platform-support-workspace-panel";
import { endPlatformSupportSessionFormAction } from "@/app/platform/actions";
import {
  getPlatformPermissions,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import {
  getActivePlatformSupportSession,
  listRecentSupportSessionsForAccount,
} from "@/lib/platform/support-sessions";

async function SupportContent() {
  const context = await requirePlatformPermission("churches.support_access");
  const [active, recent] = await Promise.all([
    getActivePlatformSupportSession(context),
    listRecentSupportSessionsForAccount(context, 25),
  ]);
  const permissions = await getPlatformPermissions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Support access</h1>
        <p className="mt-1 text-sm text-slate-400">
          Church-scoped sessions with reason, expiry, and a visible console
          banner. Sessions never create church memberships.
        </p>
      </div>

      {active ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-5 text-sm">
          <p className="font-medium text-amber-200">Active session</p>
          <p className="mt-2 text-slate-300">
            {active.church_name || active.organization_id} · {active.access_type} ·
            expires {new Date(active.expires_at).toLocaleString()}
          </p>
          <p className="mt-1 text-slate-500">{active.reason}</p>
          <form action={endPlatformSupportSessionFormAction}>
            <input type="hidden" name="session_id" value={active.id} />
            <button
              type="submit"
              className="mt-3 rounded-md border border-rose-800 px-3 py-1.5 text-rose-200"
            >
              End session
            </button>
          </form>
        </div>
      ) : null}

      {permissions.has("churches.support_access") ? (
        <PlatformSupportWorkspacePanel
          initialOrganizationId={active?.organization_id}
          initialChurchName={active?.church_name}
        />
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-slate-200">Recent sessions</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Church</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Expires / ended</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-slate-500">
                    No support sessions yet.
                  </td>
                </tr>
              ) : (
                recent.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 text-slate-400">
                      {new Date(row.started_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {row.church_name || row.organization_id}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {row.access_type}
                    </td>
                    <td className="px-3 py-2">
                      <PlatformStatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {row.ended_at
                        ? new Date(row.ended_at).toLocaleString()
                        : new Date(row.expires_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function PlatformSupportPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading support…</div>}>
      <SupportContent />
    </Suspense>
  );
}

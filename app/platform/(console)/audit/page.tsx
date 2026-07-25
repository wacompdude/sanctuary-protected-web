import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { labelForAuditAction } from "@/lib/audit/actions";
import { listRecentPlatformAudit } from "@/lib/platform/console-queries";

async function AuditContent() {
  const rows = await listRecentPlatformAudit(75);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform activity
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Recent platform_admin_actions entries.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-slate-500">
                  No platform audit events yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-400">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {labelForAuditAction(row.action)}
                    {row.reason ? (
                      <p className="text-xs text-slate-500">{row.reason}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.email_snapshot ?? "system"}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {row.target_type ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge
                      status={row.success ? "active" : "suspended"}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformAuditPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading audit…</div>}>
      <AuditContent />
    </Suspense>
  );
}

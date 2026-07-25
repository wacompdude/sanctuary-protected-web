import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listPlatformJobDeliveries } from "@/lib/platform/system-status";

async function JobsContent() {
  const jobs = await listPlatformJobDeliveries(60);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Background jobs</h1>
        <p className="mt-1 text-sm text-slate-400">
          Recent notification deliveries and 7-day queue health. Retry controls
          remain deferred.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Pending (7d)</p>
          <p className="mt-1 text-2xl font-semibold">
            {jobs.counts.pending_7d ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Failed (7d)</p>
          <p className="mt-1 text-2xl font-semibold">
            {jobs.counts.failed_7d ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs text-slate-500">Shown rows</p>
          <p className="mt-1 text-2xl font-semibold">{jobs.rows.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Attempts</th>
              <th className="px-3 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {jobs.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-500">
                  No notification deliveries found.
                </td>
              </tr>
            ) : (
              jobs.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">{row.channel}</td>
                  <td className="px-3 py-2 text-slate-300">{row.provider}</td>
                  <td className="px-3 py-2">
                    <PlatformStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2">{row.attempt_number}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-slate-500">
                    {row.last_error_message || "—"}
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

export default function PlatformJobsPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading jobs…</div>}>
      <JobsContent />
    </Suspense>
  );
}

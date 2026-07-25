import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listPlatformWebhookEvents } from "@/lib/platform/system-status";

async function WebhooksContent() {
  const events = await listPlatformWebhookEvents(40);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="mt-1 text-sm text-slate-400">
          Recent billing and notification provider webhook events. Secrets are
          never displayed.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-200">Billing events</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {events.billing.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-slate-500">
                    No billing webhook events yet.
                  </td>
                </tr>
              ) : (
                events.billing.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{row.billing_provider}</td>
                    <td className="px-3 py-2">{row.event_type}</td>
                    <td className="px-3 py-2">
                      <PlatformStatusBadge status={row.processing_status} />
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-slate-500">
                      {row.error_message || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-200">
          Notification provider events
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Processed</th>
              </tr>
            </thead>
            <tbody>
              {events.notifications.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-slate-500">
                    No notification provider events yet.
                  </td>
                </tr>
              ) : (
                events.notifications.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{row.provider}</td>
                    <td className="px-3 py-2">{row.event_type}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {row.processed_at
                        ? new Date(row.processed_at).toLocaleString()
                        : "Pending"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function PlatformWebhooksPage() {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading webhooks…</div>}
    >
      <WebhooksContent />
    </Suspense>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { hasPlatformPermission } from "@/lib/platform/auth";
import { getPlatformDashboardStats } from "@/lib/platform/console-queries";
import { labelForAuditAction } from "@/lib/audit/actions";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
    </div>
  );
  if (!href) return content;
  return (
    <Link href={href} className="block transition hover:border-amber-500/40">
      {content}
    </Link>
  );
}

async function DashboardContent() {
  const stats = await getPlatformDashboardStats();
  const canReadChurches = await hasPlatformPermission("churches.read_all");
  const canReadAccounts = await hasPlatformPermission("platform.accounts.read");
  const canReadSubs = await hasPlatformPermission("subscriptions.read_all");
  const canReadAudit = await hasPlatformPermission("audit.platform.read");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Platform overview
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Live counts from production data. Cards are hidden when the related
          permission is missing. Navigation visibility is not authorization.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total churches"
          value={stats.totalChurches}
          href={canReadChurches ? "/platform/churches" : undefined}
        />
        <StatCard label="Active churches" value={stats.activeChurches} />
        <StatCard label="Trial churches" value={stats.trialChurches} />
        <StatCard label="Suspended churches" value={stats.suspendedChurches} />
        <StatCard
          label="Active subscriptions"
          value={stats.activeSubscriptions}
          href={canReadSubs ? "/platform/subscriptions" : undefined}
        />
        <StatCard
          label="Trialing subscriptions"
          value={stats.trialingSubscriptions}
        />
        <StatCard
          label="Past due subscriptions"
          value={stats.pastDueSubscriptions}
        />
        <StatCard label="Active memberships" value={stats.activeMemberships} />
        <StatCard
          label="Active platform accounts"
          value={stats.activePlatformAccounts}
          href={canReadAccounts ? "/platform/accounts" : undefined}
        />
      </div>

      {canReadAudit ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Recent platform activity</h2>
            <Link
              href="/platform/audit"
              className="text-sm text-amber-300 hover:underline"
            >
              View audit
            </Link>
          </div>
          {stats.recentPlatformActions.length === 0 ? (
            <p className="text-sm text-slate-500">No platform actions yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                    <th className="px-3 py-2 font-medium">Actor</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPlatformActions.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800">
                      <td className="px-3 py-2 text-slate-400">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {labelForAuditAction(row.action)}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {row.email_snapshot ?? "system"}
                      </td>
                      <td className="px-3 py-2">
                        <PlatformStatusBadge
                          status={row.success ? "active" : "suspended"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default function PlatformHomePage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-56 rounded bg-slate-800" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-800" />
            ))}
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { PlatformSubscriptionAdminPanel } from "@/components/platform/platform-subscription-admin-panel";
import { billingProviderStatusMessage } from "@/lib/billing";
import {
  getPlatformPermissions,
  requirePlatformPermission,
} from "@/lib/platform/auth";
import { getPlatformChurchDetail } from "@/lib/platform/console-queries";
import {
  listActivePlansForPlatformAdmin,
  listPlatformSubscriptionHistory,
} from "@/lib/platform/subscription-admin";

async function SubscriptionContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformPermission("subscriptions.read_all");
  const { id } = await params;
  const church = await getPlatformChurchDetail(id);
  if (!church) notFound();

  const permissions = await getPlatformPermissions();
  const canChangePlan = permissions.has("subscriptions.change_plan");
  const canCancel = permissions.has("subscriptions.cancel");
  const canRestore = permissions.has("subscriptions.restore");

  const [plans, history] = await Promise.all([
    canChangePlan || canCancel || canRestore
      ? listActivePlansForPlatformAdmin()
      : Promise.resolve([]),
    listPlatformSubscriptionHistory(church.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/churches/${church.id}`}
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← {church.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Subscription
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          View and administer this church&apos;s plan. Changes are audited and
          owners are notified.
        </p>
      </div>

      {church.subscription ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium">
                {church.subscription.planDisplayName}{" "}
                <span className="text-slate-500">
                  ({church.subscription.planKey})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd className="mt-1">
                <PlatformStatusBadge status={church.subscription.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Trial end</dt>
              <dd>
                {church.subscription.trialEndsAt
                  ? new Date(church.subscription.trialEndsAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Current period end</dt>
              <dd>
                {church.subscription.currentPeriodEnd
                  ? new Date(
                      church.subscription.currentPeriodEnd,
                    ).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Cancel at period end</dt>
              <dd>{church.subscription.cancelAtPeriodEnd ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No current subscription.</p>
      )}

      {canChangePlan || canCancel || canRestore ? (
        <PlatformSubscriptionAdminPanel
          organizationId={church.id}
          churchName={church.name}
          currentPlanKey={church.subscription?.planKey ?? null}
          cancelAtPeriodEnd={
            church.subscription?.cancelAtPeriodEnd ?? false
          }
          subscriptionStatus={church.subscription?.status ?? null}
          plans={plans}
          providerMessage={billingProviderStatusMessage()}
          canChangePlan={canChangePlan}
          canCancel={canCancel}
          canRestore={canRestore}
        />
      ) : null}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-slate-200">Change history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No subscription changes yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-800/80 last:border-0"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {row.change_type}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {row.old_plan_key || "—"} → {row.new_plan_key || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {row.old_status || "—"} → {row.new_status || "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-slate-400">
                      {row.reason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlatformChurchSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading subscription…</div>}
    >
      <SubscriptionContent params={params} />
    </Suspense>
  );
}

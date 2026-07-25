import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listSubscriptionPlansForPlatform } from "@/lib/platform/console-queries";

async function PlansContent() {
  const plans = await listSubscriptionPlansForPlatform();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plans</h1>
        <p className="mt-1 text-sm text-slate-400">
          Catalog from subscription_plans. Editing is reserved for later
          phases.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Monthly</th>
              <th className="px-3 py-2 font-medium">Churches</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  {plan.display_name}
                  {plan.is_default ? (
                    <span className="ml-2 text-xs text-amber-300">default</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {plan.plan_key}
                </td>
                <td className="px-3 py-2">
                  <PlatformStatusBadge status={plan.status} />
                </td>
                <td className="px-3 py-2">
                  {plan.monthly_price_cents == null
                    ? "—"
                    : `$${(plan.monthly_price_cents / 100).toFixed(2)}`}
                </td>
                <td className="px-3 py-2">{plan.churchCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformPlansPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading plans…</div>}>
      <PlansContent />
    </Suspense>
  );
}

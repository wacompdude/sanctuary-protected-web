import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlatformPlanFeaturesEditor } from "@/components/platform/platform-plan-features-editor";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { getPlatformPermissions } from "@/lib/platform/auth";
import { getPlanCatalogForPlatform } from "@/lib/platform/plan-catalog-admin";

async function PlanDetailContent({
  params,
}: {
  params: Promise<{ planKey: string }>;
}) {
  const { planKey } = await params;
  const plan = await getPlanCatalogForPlatform(planKey);
  if (!plan) notFound();
  const permissions = await getPlatformPermissions();
  const canManage = permissions.has("plans.manage");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/platform/plans"
          className="text-sm text-slate-400 hover:text-amber-300"
        >
          ← Plans
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {plan.displayName}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {plan.description || "Review and assign modules for this subscription tier."}
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Plan key</dt>
            <dd className="font-mono text-xs">{plan.planKey}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <PlatformStatusBadge status={plan.status} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Display order</dt>
            <dd>{plan.sortOrder}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Default</dt>
            <dd>{plan.isDefault ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Features & modules</h2>
        <p className="text-sm text-slate-400">
          Changing an assignment updates the Feature Catalog immediately.
          Church data is preserved when a feature is removed from a plan.
        </p>
        <PlatformPlanFeaturesEditor
          planKey={plan.planKey}
          features={plan.features}
          canManage={canManage}
        />
      </div>
    </div>
  );
}

export default function PlatformPlanDetailPage({
  params,
}: {
  params: Promise<{ planKey: string }>;
}) {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading plan…</div>}>
      <PlanDetailContent params={params} />
    </Suspense>
  );
}

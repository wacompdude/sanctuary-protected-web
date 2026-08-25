import { Suspense } from "react";
import Link from "next/link";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listFeatureCatalogForPlatform } from "@/lib/platform/plan-catalog-admin";

async function FeaturesContent() {
  const features = await listFeatureCatalogForPlatform();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feature Catalog</h1>
        <p className="mt-1 text-sm text-slate-400">
          Feature keys are used by application code and should not be renamed
          casually. Assign features to tiers from{" "}
          <Link href="/platform/plans" className="text-amber-300 hover:underline">
            Plans
          </Link>
          .
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Feature</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Minimum tier</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <div>{feature.displayName}</div>
                  {feature.description ? (
                    <div className="mt-1 max-w-md text-xs text-slate-500">
                      {feature.description}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {feature.featureKey}
                </td>
                <td className="px-3 py-2">
                  {feature.minimumPlanName ?? "—"}
                </td>
                <td className="px-3 py-2 capitalize">
                  {feature.category ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <PlatformStatusBadge status={feature.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PlatformFeaturesPage() {
  return (
    <Suspense
      fallback={<div className="text-slate-400">Loading features…</div>}
    >
      <FeaturesContent />
    </Suspense>
  );
}

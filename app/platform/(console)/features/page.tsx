import { Suspense } from "react";
import { PlatformStatusBadge } from "@/components/platform/platform-status-badge";
import { listFeaturesForPlatform } from "@/lib/platform/console-queries";

async function FeaturesContent() {
  const features = await listFeaturesForPlatform();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Features</h1>
        <p className="mt-1 text-sm text-slate-400">
          Feature registry used by entitlement resolution.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Feature</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature.id} className="border-t border-slate-800">
                <td className="px-3 py-2">{feature.display_name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {feature.feature_key}
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

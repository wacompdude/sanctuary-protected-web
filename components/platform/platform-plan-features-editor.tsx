"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePlanFeatureAction } from "@/app/platform/(console)/plans/actions";
import type { PlatformPlanFeatureRow } from "@/lib/platform/plan-catalog-admin";

export function PlatformPlanFeaturesEditor({
  planKey,
  features,
  canManage,
}: {
  planKey: string;
  features: PlatformPlanFeatureRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePlanFeatureAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Feature</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Included</th>
            </tr>
          </thead>
          <tbody>
            {features.map((feature) => (
              <tr key={feature.featureId} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-100">
                    {feature.displayName}
                  </div>
                  <div className="text-xs capitalize text-slate-500">
                    {feature.category ?? "—"}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-400">
                  {feature.featureKey}
                </td>
                <td className="px-3 py-2">
                  {feature.valueType === "integer" ? (
                    <form action={submit} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="plan_key" value={planKey} />
                      <input type="hidden" name="feature_id" value={feature.featureId} />
                      <input type="hidden" name="value_type" value="integer" />
                      <input
                        name="integer_value"
                        type="number"
                        min={0}
                        defaultValue={feature.unlimited ? "" : (feature.integerValue ?? 0)}
                        disabled={!canManage || pending}
                        className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-400">
                        <input
                          type="checkbox"
                          name="unlimited"
                          value="1"
                          defaultChecked={feature.unlimited}
                          disabled={!canManage || pending}
                        />
                        Unlimited
                      </label>
                      {canManage ? (
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Save
                        </button>
                      ) : null}
                    </form>
                  ) : (
                    <form action={submit} className="flex items-center gap-2">
                      <input type="hidden" name="plan_key" value={planKey} />
                      <input type="hidden" name="feature_id" value={feature.featureId} />
                      <input type="hidden" name="value_type" value="boolean" />
                      <input
                        type="hidden"
                        name="enabled"
                        value={feature.enabled ? "0" : "1"}
                      />
                      <span className={feature.enabled ? "text-emerald-400" : "text-slate-500"}>
                        {feature.enabled ? "Included" : "Locked"}
                      </span>
                      {canManage ? (
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          {feature.enabled ? "Remove" : "Include"}
                        </button>
                      ) : null}
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canManage ? (
        <p className="text-xs text-slate-500">
          You can review assignments. Changing them requires plans.manage.
        </p>
      ) : null}
    </div>
  );
}

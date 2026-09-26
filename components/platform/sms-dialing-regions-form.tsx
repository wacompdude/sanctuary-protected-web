"use client";

import { useActionState } from "react";
import { updateSmsDialingRegionAction } from "@/app/platform/(console)/sms/actions";
import type { DialingRegion } from "@/lib/sms/phone-entry";

export function SmsDialingRegionsForm({
  regions,
  editable,
}: {
  regions: DialingRegion[];
  editable: boolean;
}) {
  return (
    <div className="space-y-4">
      {regions.map((region) => (
        <RegionRow key={region.regionCode} region={region} editable={editable} />
      ))}
    </div>
  );
}

function RegionRow({
  region,
  editable,
}: {
  region: DialingRegion;
  editable: boolean;
}) {
  const [state, action, pending] = useActionState(updateSmsDialingRegionAction, {});

  return (
    <form
      action={action}
      className="rounded-lg border border-slate-800 bg-slate-900/40 p-4"
    >
      <input type="hidden" name="region_code" value={region.regionCode} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-slate-100">
            {region.displayName}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {region.isoCountryCode} · Dialing code {region.dialingCode} ·
            Display order {region.sortOrder}
          </p>
        </div>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {region.regionCode}
        </p>
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-200">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="enabled"
            value="on"
            defaultChecked={region.enabled}
            disabled={!editable || pending}
          />
          Platform enabled
        </label>
        <p className="pl-6 text-xs text-slate-500">
          Sanctuary Protected wants to offer SMS enrollment here.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="provider_ready"
            value="on"
            defaultChecked={region.providerReady}
            disabled={!editable || pending}
          />
          Provider ready
        </label>
        <p className="pl-6 text-xs text-slate-500">
          The SMS provider is known to be approved for this region. Saving this
          does not register or configure Bird. Users see a region only when
          both are on, and only when its dialing code differs from the others.
        </p>
      </div>
      {state.error ? (
        <p className="mt-2 text-sm text-red-300">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="mt-2 text-sm text-emerald-300">Saved.</p>
      ) : null}
      {editable ? (
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save region"}
        </button>
      ) : null}
    </form>
  );
}

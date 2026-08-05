"use client";

import { useActionState } from "react";
import {
  markFirstChurchAsDemoAction,
  testDemoRestoreLockAction,
  updateDemoOrganizationFlagsAction,
  type DemoOrgActionState,
} from "@/app/platform/(console)/demo-organizations/actions";
import type { DemoOrganizationRecord } from "@/lib/platform/demo-snapshots/guardrails";

const initial: DemoOrgActionState = {};

export function MarkFirstChurchDemoForm({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(
    markFirstChurchAsDemoAction,
    initial,
  );

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Environment label</span>
        <input
          name="demo_environment_label"
          defaultValue="production-demo"
          disabled={disabled || pending}
          className="w-full max-w-md rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || pending}
        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Mark First Church as demo"}
      </button>
      {state.error ? (
        <p className="text-sm text-rose-300">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-300">{state.success}</p>
      ) : null}
    </form>
  );
}

export function DemoOrgFlagsForm({ org }: { org: DemoOrganizationRecord }) {
  const [state, action, pending] = useActionState(
    updateDemoOrganizationFlagsAction,
    initial,
  );

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
    >
      <h2 className="text-sm font-semibold text-slate-100">Demo guardrails</h2>
      <input type="hidden" name="organization_id" value={org.id} />
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          name="demo_restore_enabled"
          defaultChecked={org.demo_restore_enabled}
          disabled={pending}
        />
        Restore enabled
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          name="demo_restore_locked"
          defaultChecked={org.demo_restore_locked}
          disabled={pending}
        />
        Restore locked
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          name="demo_maintenance_mode"
          defaultChecked={org.demo_maintenance_mode}
          disabled={pending}
        />
        Maintenance mode
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Environment label</span>
        <input
          name="demo_environment_label"
          defaultValue={org.demo_environment_label ?? ""}
          disabled={pending}
          className="w-full max-w-md rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save flags"}
      </button>
      {state.error ? (
        <p className="text-sm text-rose-300">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-300">{state.success}</p>
      ) : null}
    </form>
  );
}

export function DemoRestoreLockTestForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    testDemoRestoreLockAction,
    initial,
  );

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
    >
      <h2 className="text-sm font-semibold text-slate-100">
        Restore lock test (Phase 3)
      </h2>
      <p className="text-xs text-slate-400">
        Acquiring a lock also turns on maintenance mode. Release when finished
        testing.
      </p>
      <input type="hidden" name="organization_id" value={organizationId} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="mode"
          value="acquire"
          disabled={pending}
          className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Acquire lock
        </button>
        <button
          type="submit"
          name="mode"
          value="release"
          disabled={pending}
          className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
        >
          Release lock
        </button>
      </div>
      {state.error ? (
        <p className="text-sm text-rose-300">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-300">{state.success}</p>
      ) : null}
    </form>
  );
}

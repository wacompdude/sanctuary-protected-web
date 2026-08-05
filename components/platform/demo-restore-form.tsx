"use client";

import { useActionState } from "react";
import {
  executeDemoRestoreAction,
  previewDemoRestoreAction,
  type DemoRestoreActionState,
} from "@/app/platform/(console)/demo-organizations/restore-actions";
import { DEMO_RESTORE_CONFIRMATION_PHRASE } from "@/lib/platform/demo-snapshots/snapshot-table-registry";
import type { DemoSnapshotRecord } from "@/lib/platform/demo-snapshots/types";

const initial: DemoRestoreActionState = {};

export function DemoRestoreForm({
  organizationId,
  snapshots,
  initialSnapshotId,
}: {
  organizationId: string;
  snapshots: DemoSnapshotRecord[];
  initialSnapshotId?: string;
}) {
  const [previewState, previewAction, previewPending] = useActionState(
    previewDemoRestoreAction,
    initial,
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    executeDemoRestoreAction,
    initial,
  );

  const dryRun = previewState.dryRun;
  const readySnapshots = snapshots.filter(
    (s) => s.snapshot_status === "ready" && !s.archived_at,
  );

  return (
    <div className="space-y-8">
      <form action={previewAction} className="space-y-4 max-w-xl">
        <input type="hidden" name="organization_id" value={organizationId} />
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Snapshot</span>
          <select
            name="snapshot_id"
            required
            defaultValue={initialSnapshotId ?? ""}
            disabled={previewPending || restorePending}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="" disabled>
              Select a ready snapshot…
            </option>
            {readySnapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_default ? " (default)" : ""}
                {s.version_label ? ` · ${s.version_label}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={previewPending || restorePending || readySnapshots.length === 0}
          className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
        >
          {previewPending ? "Running dry-run…" : "Preview impact (dry-run)"}
        </button>
        {previewState.error ? (
          <p className="text-sm text-rose-300">{previewState.error}</p>
        ) : null}
        {previewState.success ? (
          <p className="text-sm text-emerald-300">{previewState.success}</p>
        ) : null}
      </form>

      {dryRun ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
          <h2 className="font-semibold text-slate-100">Dry-run summary</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-slate-400">Compatibility</span>
              <div className="text-slate-100">{dryRun.compatibility}</div>
            </div>
            <div>
              <span className="text-slate-400">Plan</span>
              <div className="font-mono text-xs text-slate-200">
                {dryRun.current_plan_key ?? "—"} →{" "}
                {dryRun.snapshot_plan_key ?? "—"}
                {dryRun.plan_change ? " (changes)" : ""}
              </div>
            </div>
            <div>
              <span className="text-slate-400">Memberships</span>
              <div>
                {dryRun.membership_current_count} →{" "}
                {dryRun.membership_snapshot_count}
              </div>
            </div>
            <div>
              <span className="text-slate-400">Files</span>
              <div>
                ~{dryRun.file_count_current_estimate} →{" "}
                {dryRun.file_count_snapshot}
              </div>
            </div>
          </div>

          {dryRun.blockers.length > 0 ? (
            <div className="rounded border border-rose-800/60 bg-rose-950/30 p-3 text-rose-100">
              Blockers: {dryRun.blockers.join("; ")}
            </div>
          ) : null}

          {dryRun.warnings.length > 0 ? (
            <details className="text-amber-100/90">
              <summary className="cursor-pointer">
                {dryRun.warnings.length} warning(s)
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
                {dryRun.warnings.slice(0, 30).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <details>
            <summary className="cursor-pointer text-slate-300">
              Table deltas ({dryRun.tables_to_insert.length})
            </summary>
            <ul className="mt-2 max-h-64 overflow-auto font-mono text-xs text-slate-400">
              {dryRun.tables_to_insert.map((t) => (
                <li key={t.table} className="flex justify-between gap-3 py-0.5">
                  <span>{t.table}</span>
                  <span>
                    {t.current_count} → {t.snapshot_count} ({t.delta >= 0 ? "+" : ""}
                    {t.delta})
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <form action={restoreAction} className="space-y-3 border-t border-slate-800 pt-4">
            <input type="hidden" name="organization_id" value={organizationId} />
            <input type="hidden" name="snapshot_id" value={dryRun.snapshot_id} />
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Reason</span>
              <textarea
                name="reason"
                required
                minLength={3}
                rows={2}
                disabled={restorePending || dryRun.blockers.length > 0}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                placeholder="Why is this restore being performed?"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-amber-200/90">
                Type {DEMO_RESTORE_CONFIRMATION_PHRASE}
              </span>
              <input
                name="confirmation_text"
                required
                disabled={restorePending || dryRun.blockers.length > 0}
                className="w-full rounded-md border border-amber-800/60 bg-slate-950 px-3 py-2 text-slate-100"
                autoComplete="off"
              />
            </label>
            <p className="text-xs text-slate-500">
              Requires MFA and a session signed in within the last 15 minutes. A
              safety snapshot is created automatically before changes.
            </p>
            <button
              type="submit"
              disabled={restorePending || dryRun.blockers.length > 0}
              className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {restorePending ? "Restoring…" : "Restore demo church"}
            </button>
            {restoreState.error ? (
              <p className="text-sm text-rose-300">{restoreState.error}</p>
            ) : null}
            {restoreState.success ? (
              <p className="text-sm text-emerald-300">{restoreState.success}</p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}

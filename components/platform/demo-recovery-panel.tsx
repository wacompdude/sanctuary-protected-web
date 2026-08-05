"use client";

import { useActionState } from "react";
import {
  emergencyUnlockDemoAction,
  expireStaleLocksAction,
  manualRollbackDemoAction,
  recoverFailedOperationAction,
  type DemoRecoveryActionState,
} from "@/app/platform/(console)/demo-organizations/recovery-actions";
import type { DemoPlatformAlert } from "@/lib/platform/demo-snapshots/alerts";
import type { RecoveryStatus } from "@/lib/platform/demo-snapshots/recovery";
import {
  DEMO_EMERGENCY_UNLOCK_PHRASE,
  DEMO_RESTORE_CONFIRMATION_PHRASE,
} from "@/lib/platform/demo-snapshots/phrases";

const initial: DemoRecoveryActionState = {};

export function DemoRecoveryPanel({
  organizationId,
  status,
  alerts,
  canUnlock,
  canRollback,
  canManage,
}: {
  organizationId: string;
  status: RecoveryStatus;
  alerts: DemoPlatformAlert[];
  canUnlock: boolean;
  canRollback: boolean;
  canManage: boolean;
}) {
  const [unlockState, unlockAction, unlockPending] = useActionState(
    emergencyUnlockDemoAction,
    initial,
  );
  const [rollbackState, rollbackAction, rollbackPending] = useActionState(
    manualRollbackDemoAction,
    initial,
  );
  const [recoverState, recoverAction, recoverPending] = useActionState(
    recoverFailedOperationAction,
    initial,
  );
  const [expireState, expireAction, expirePending] = useActionState(
    expireStaleLocksAction,
    initial,
  );

  const locked =
    status.demoRestoreLocked ||
    status.demoMaintenanceMode ||
    Boolean(status.activeLock);

  return (
    <div className="space-y-6">
      {alerts.length > 0 ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4">
          <h2 className="text-sm font-semibold text-amber-100">
            Recent platform alerts
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {alerts.slice(0, 8).map((alert) => (
              <li key={alert.id} className="text-amber-50/90">
                <span className="font-mono text-xs text-amber-200/70">
                  {alert.severity}
                </span>{" "}
                <span className="text-slate-300">{alert.action}</span>
                <div className="text-xs text-slate-500">
                  {new Date(alert.created_at).toLocaleString()}
                  {alert.reason ? ` — ${alert.reason}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
        <h2 className="font-semibold text-slate-100">Recovery status</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <div>
            <span className="text-slate-400">Restore locked</span>
            <div>{status.demoRestoreLocked ? "Yes" : "No"}</div>
          </div>
          <div>
            <span className="text-slate-400">Maintenance</span>
            <div>{status.demoMaintenanceMode ? "On" : "Off"}</div>
          </div>
          <div>
            <span className="text-slate-400">Active lock</span>
            <div>
              {status.activeLock
                ? `${status.activeLock.expired ? "EXPIRED" : "Active"} until ${new Date(status.activeLock.expires_at).toLocaleString()}`
                : "None"}
            </div>
          </div>
          <div>
            <span className="text-slate-400">Open / failed ops</span>
            <div>{status.openOperations.length}</div>
          </div>
        </div>

        {canManage ? (
          <form action={expireAction} className="mt-4">
            <input type="hidden" name="organization_id" value={organizationId} />
            <button
              type="submit"
              disabled={expirePending}
              className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
            >
              {expirePending ? "Checking…" : "Expire stale lock (if past TTL)"}
            </button>
            {expireState.error ? (
              <p className="mt-2 text-rose-300">{expireState.error}</p>
            ) : null}
            {expireState.success ? (
              <p className="mt-2 text-emerald-300">{expireState.success}</p>
            ) : null}
          </form>
        ) : null}
      </div>

      {canUnlock && locked ? (
        <form
          action={unlockAction}
          className="space-y-3 rounded-lg border border-rose-900/50 bg-rose-950/20 p-4"
        >
          <h2 className="text-sm font-semibold text-rose-100">
            Emergency unlock
          </h2>
          <p className="text-xs text-rose-100/70">
            Clears restore lock and maintenance without restoring data. Requires
            MFA and a fresh session.
          </p>
          <input type="hidden" name="organization_id" value={organizationId} />
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Reason</span>
            <textarea
              name="reason"
              required
              minLength={8}
              rows={2}
              disabled={unlockPending}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-amber-200/90">
              Type {DEMO_EMERGENCY_UNLOCK_PHRASE}
            </span>
            <input
              name="confirmation_text"
              required
              disabled={unlockPending}
              className="w-full rounded-md border border-amber-800/60 bg-slate-950 px-3 py-2 text-slate-100"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={unlockPending}
            className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {unlockPending ? "Unlocking…" : "Emergency unlock"}
          </button>
          {unlockState.error ? (
            <p className="text-sm text-rose-300">{unlockState.error}</p>
          ) : null}
          {unlockState.success ? (
            <p className="text-sm text-emerald-300">{unlockState.success}</p>
          ) : null}
        </form>
      ) : null}

      {canRollback && status.latestFailedWithSafety ? (
        <form
          action={rollbackAction}
          className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
        >
          <h2 className="text-sm font-semibold text-slate-100">
            Manual rollback
          </h2>
          <p className="text-xs text-slate-400">
            Restore the automatic safety snapshot from operation{" "}
            <span className="font-mono">
              {status.latestFailedWithSafety.id.slice(0, 8)}
            </span>
            .
          </p>
          <input type="hidden" name="organization_id" value={organizationId} />
          <input
            type="hidden"
            name="source_operation_id"
            value={status.latestFailedWithSafety.id}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Reason</span>
            <textarea
              name="reason"
              required
              minLength={3}
              rows={2}
              disabled={rollbackPending}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-amber-200/90">
              Type {DEMO_RESTORE_CONFIRMATION_PHRASE}
            </span>
            <input
              name="confirmation_text"
              required
              disabled={rollbackPending}
              className="w-full rounded-md border border-amber-800/60 bg-slate-950 px-3 py-2 text-slate-100"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={rollbackPending}
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {rollbackPending ? "Rolling back…" : "Roll back to safety snapshot"}
          </button>
          {rollbackState.error ? (
            <p className="text-sm text-rose-300">{rollbackState.error}</p>
          ) : null}
          {rollbackState.success ? (
            <p className="text-sm text-emerald-300">{rollbackState.success}</p>
          ) : null}
        </form>
      ) : null}

      {canUnlock && status.openOperations.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <h2 className="text-sm font-semibold text-slate-100">
            Failed-operation recovery
          </h2>
          {status.openOperations.slice(0, 5).map((op) => (
            <form
              key={op.id}
              action={recoverAction}
              className="space-y-2 border-t border-slate-800 pt-3 first:border-t-0 first:pt-0"
            >
              <div className="text-xs text-slate-400">
                <span className="font-mono text-slate-300">
                  {op.id.slice(0, 8)}
                </span>{" "}
                · {op.operation_type} · {op.status}
                {op.safe_error_summary ? (
                  <div className="mt-1 text-rose-300">{op.safe_error_summary}</div>
                ) : null}
              </div>
              <input type="hidden" name="organization_id" value={organizationId} />
              <input type="hidden" name="operation_id" value={op.id} />
              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">Recovery reason</span>
                <input
                  name="reason"
                  required
                  minLength={8}
                  disabled={recoverPending}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  name="clear_lock"
                  defaultChecked
                  disabled={recoverPending}
                />
                Also clear restore lock / maintenance
              </label>
              <button
                type="submit"
                disabled={recoverPending}
                className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
              >
                {recoverPending ? "Recovering…" : "Mark recovered"}
              </button>
            </form>
          ))}
          {recoverState.error ? (
            <p className="text-sm text-rose-300">{recoverState.error}</p>
          ) : null}
          {recoverState.success ? (
            <p className="text-sm text-emerald-300">{recoverState.success}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

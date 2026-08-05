"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  archiveDemoSnapshotAction,
  createDemoSnapshotAction,
  setDemoSnapshotDefaultAction,
  setDemoSnapshotProtectedAction,
  type DemoSnapshotActionState,
} from "@/app/platform/(console)/demo-organizations/snapshot-actions";
import type { DemoSnapshotRecord } from "@/lib/platform/demo-snapshots/types";

const initial: DemoSnapshotActionState = {};

export function CreateDemoSnapshotForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createDemoSnapshotAction,
    initial,
  );

  useEffect(() => {
    if (state.snapshotId) {
      router.push(
        `/platform/demo-organizations/${organizationId}/snapshots/${state.snapshotId}`,
      );
    }
  }, [state.snapshotId, organizationId, router]);

  return (
    <form action={action} className="space-y-4 max-w-xl">
      <input type="hidden" name="organization_id" value={organizationId} />
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Name</span>
        <input
          name="name"
          required
          placeholder="Clean Starting Demo"
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Version label</span>
        <input
          name="version_label"
          placeholder="v1"
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Description</span>
        <textarea
          name="description"
          rows={3}
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">
          Tags (comma-separated)
        </span>
        <input
          name="tags"
          placeholder="sales, omni, training"
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Creating snapshot…" : "Create snapshot"}
      </button>
      {state.error ? (
        <p className="text-sm text-rose-300">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-300">{state.success}</p>
      ) : null}
      <p className="text-xs text-slate-500">
        Exports demo church records and copies referenced Storage files into the
        private snapshot bucket. This can take a minute for larger demos.
      </p>
    </form>
  );
}

export function DemoSnapshotControls({
  snapshot,
  canSetDefault,
  canProtect,
  canArchive,
}: {
  snapshot: DemoSnapshotRecord;
  canSetDefault: boolean;
  canProtect: boolean;
  canArchive: boolean;
}) {
  const [defaultState, defaultAction, defaultPending] = useActionState(
    setDemoSnapshotDefaultAction,
    initial,
  );
  const [protectState, protectAction, protectPending] = useActionState(
    setDemoSnapshotProtectedAction,
    initial,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveDemoSnapshotAction,
    initial,
  );

  if (snapshot.archived_at) {
    return (
      <p className="text-sm text-slate-400">This snapshot is archived.</p>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-slate-100">Controls</h2>

      {canSetDefault &&
      snapshot.snapshot_status === "ready" &&
      !snapshot.is_default ? (
        <form action={defaultAction}>
          <input
            type="hidden"
            name="organization_id"
            value={snapshot.organization_id}
          />
          <input type="hidden" name="snapshot_id" value={snapshot.id} />
          <button
            type="submit"
            disabled={defaultPending}
            className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
          >
            {defaultPending ? "Saving…" : "Set as default reset version"}
          </button>
          {defaultState.error ? (
            <p className="mt-2 text-sm text-rose-300">{defaultState.error}</p>
          ) : null}
          {defaultState.success ? (
            <p className="mt-2 text-sm text-emerald-300">
              {defaultState.success}
            </p>
          ) : null}
        </form>
      ) : null}

      {canProtect ? (
        <form action={protectAction} className="space-y-2">
          <input
            type="hidden"
            name="organization_id"
            value={snapshot.organization_id}
          />
          <input type="hidden" name="snapshot_id" value={snapshot.id} />
          <input
            type="hidden"
            name="is_protected"
            value={snapshot.is_protected ? "false" : "true"}
          />
          <button
            type="submit"
            disabled={protectPending}
            className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
          >
            {protectPending
              ? "Saving…"
              : snapshot.is_protected
                ? "Remove protection"
                : "Protect snapshot"}
          </button>
          {protectState.error ? (
            <p className="text-sm text-rose-300">{protectState.error}</p>
          ) : null}
          {protectState.success ? (
            <p className="text-sm text-emerald-300">{protectState.success}</p>
          ) : null}
        </form>
      ) : null}

      {canArchive ? (
        <form action={archiveAction} className="space-y-2 border-t border-slate-800 pt-4">
          <input
            type="hidden"
            name="organization_id"
            value={snapshot.organization_id}
          />
          <input type="hidden" name="snapshot_id" value={snapshot.id} />
          {snapshot.is_protected ? (
            <label className="block text-sm">
              <span className="mb-1 block text-amber-200/90">
                Type ARCHIVE PROTECTED SNAPSHOT to confirm
              </span>
              <input
                name="confirm_protected"
                disabled={archivePending}
                className="w-full max-w-md rounded-md border border-amber-800/60 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          ) : null}
          <button
            type="submit"
            disabled={archivePending || snapshot.is_default}
            className="rounded-md bg-rose-700/80 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {archivePending ? "Archiving…" : "Archive snapshot"}
          </button>
          {snapshot.is_default ? (
            <p className="text-xs text-slate-500">
              Clear default before archiving.
            </p>
          ) : null}
          {archiveState.error ? (
            <p className="text-sm text-rose-300">{archiveState.error}</p>
          ) : null}
          {archiveState.success ? (
            <p className="text-sm text-emerald-300">{archiveState.success}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

export function DemoSnapshotMetadataForm({
  snapshot,
}: {
  snapshot: DemoSnapshotRecord;
}) {
  const [state, action, pending] = useActionState(
    updateDemoSnapshotMetadataAction,
    initial,
  );

  if (snapshot.archived_at) {
    return null;
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
    >
      <h2 className="text-sm font-semibold text-slate-100">Edit metadata</h2>
      <input type="hidden" name="organization_id" value={snapshot.organization_id} />
      <input type="hidden" name="snapshot_id" value={snapshot.id} />
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Name</span>
        <input
          name="name"
          required
          defaultValue={snapshot.name}
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Version label</span>
        <input
          name="version_label"
          defaultValue={snapshot.version_label ?? ""}
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={snapshot.description ?? ""}
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Tags (comma-separated)</span>
        <input
          name="tags"
          defaultValue={snapshot.tags.join(", ")}
          disabled={pending}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save metadata"}
      </button>
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-emerald-300">{state.success}</p>
      ) : null}
    </form>
  );
}

export function DemoSnapshotDeleteForm({
  snapshot,
}: {
  snapshot: DemoSnapshotRecord;
}) {
  const [state, action, pending] = useActionState(
    deleteDemoSnapshotAction,
    initial,
  );

  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-rose-900/40 bg-rose-950/10 p-4"
    >
      <h2 className="text-sm font-semibold text-rose-100">Delete snapshot</h2>
      <p className="text-xs text-slate-400">
        Soft-archives when possible. Permanent delete is blocked for the only
        baseline, protected (without confirmation), or actively referenced
        snapshots.
      </p>
      <input type="hidden" name="organization_id" value={snapshot.organization_id} />
      <input type="hidden" name="snapshot_id" value={snapshot.id} />
      {snapshot.is_protected ? (
        <label className="block text-sm">
          <span className="mb-1 block text-amber-200/90">
            Type DELETE PROTECTED SNAPSHOT to confirm
          </span>
          <input
            name="confirm_protected"
            disabled={pending}
            className="w-full max-w-md rounded-md border border-amber-800/60 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending || snapshot.is_default}
        className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete snapshot"}
      </button>
      {state.error ? <p className="text-sm text-rose-300">{state.error}</p> : null}
      {state.success ? (
        <p className="text-sm text-emerald-300">{state.success}</p>
      ) : null}
    </form>
  );
}

export function DemoSnapshotRetentionForm({
  organizationId,
  defaultDays,
}: {
  organizationId: string;
  defaultDays: number;
}) {
  const [state, action, pending] = useActionState(
    applyDemoSnapshotRetentionAction,
    initial,
  );

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
    >
      <input type="hidden" name="organization_id" value={organizationId} />
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">
          Archive automatic snapshots older than (days)
        </span>
        <input
          name="retention_days"
          type="number"
          min={1}
          defaultValue={defaultDays}
          disabled={pending}
          className="w-32 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
      >
        {pending ? "Applying…" : "Apply retention"}
      </button>
      {state.error ? <p className="w-full text-sm text-rose-300">{state.error}</p> : null}
      {state.success ? (
        <p className="w-full text-sm text-emerald-300">{state.success}</p>
      ) : null}
    </form>
  );
}

export function SnapshotFeatureSummaryList({
  summary,
}: {
  summary: SnapshotFeatureSummary;
}) {
  if (summary.labels.length === 0) {
    return <p className="text-sm text-slate-400">No feature signals recorded.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {summary.labels.map((label) => (
        <li
          key={label}
          className="rounded border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-300"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

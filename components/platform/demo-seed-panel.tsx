"use client";

import { useActionState } from "react";
import { PlatformButton } from "@/components/platform/platform-button";
import {
  cleanupDemoSeedAction,
  runDemoSeedAction,
  type DemoSeedActionResult,
} from "@/app/platform/(console)/system/demo-seed/actions";
import type { DemoSeedSummary } from "@/lib/demo-seed/types";

function CountTable({ counts }: { counts: DemoSeedSummary["counts"] }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Domain</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium">Skipped</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([domain, bucket]) => (
            <tr key={domain} className="border-t border-slate-800">
              <td className="px-3 py-2 font-mono text-xs text-slate-300">
                {domain}
              </td>
              <td className="px-3 py-2">{bucket.created}</td>
              <td className="px-3 py-2">{bucket.updated}</td>
              <td className="px-3 py-2">{bucket.skipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultPanel({ result }: { result: DemoSeedActionResult | null }) {
  if (!result) return null;

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
        {result.error}
      </div>
    );
  }

  if (result.kind === "cleanup") {
    const s = result.summary;
    return (
      <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
        <p className="font-medium text-slate-100">Cleanup complete</p>
        <p className="text-slate-400">
          Church: {s.churchName}
          {s.churchId ? ` (${s.churchId})` : ""}
        </p>
        <pre className="overflow-x-auto rounded bg-slate-950/60 p-3 text-xs text-slate-300">
          {JSON.stringify(s.deleted, null, 2)}
        </pre>
        {s.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  const s = result.summary;
  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
      <div>
        <p className="font-medium text-slate-100">Seed complete</p>
        <p className="mt-1 text-slate-400">
          {s.churchName}
          {s.churchId ? ` · ${s.churchId}` : ""}
        </p>
      </div>
      <CountTable counts={s.counts} />
      {s.testAccounts.length > 0 ? (
        <div>
          <p className="mb-2 font-medium text-slate-200">
            Test accounts (passwords never shown)
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {s.testAccounts.map((a) => (
                  <tr key={a.email} className="border-t border-slate-800">
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.email}</td>
                    <td className="px-3 py-2">{a.role}</td>
                    <td className="px-3 py-2">{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {s.warnings.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-amber-200/90">
          {s.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DemoSeedPanel({
  environmentAllowed,
  churchId,
}: {
  environmentAllowed: boolean;
  churchId: string | null;
}) {
  const [seedState, seedAction, seedPending] = useActionState(
    runDemoSeedAction,
    null,
  );
  const [cleanupState, cleanupAction, cleanupPending] = useActionState(
    cleanupDemoSeedAction,
    null,
  );

  const result = (() => {
    if (seedState && cleanupState) {
      const seedFinished =
        seedState.ok && seedState.kind === "seed"
          ? seedState.summary.finishedAt
          : null;
      const cleanupFinished =
        cleanupState.ok && cleanupState.kind === "cleanup"
          ? cleanupState.summary.finishedAt
          : null;
      if (seedFinished && cleanupFinished) {
        return seedFinished >= cleanupFinished ? seedState : cleanupState;
      }
    }
    return seedState ?? cleanupState;
  })();

  return (
    <div className="space-y-6">
      {!environmentAllowed ? (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-100">
          Demo seed/cleanup is blocked in this environment. Use development,
          preview, staging, or set{" "}
          <code className="font-mono text-xs">DEMO_SEED_ALLOW_PRODUCTION=true</code>{" "}
          on an authorized test project only.
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5 text-sm">
        <h2 className="font-medium text-slate-100">Current demo church</h2>
        <p className="mt-2 text-slate-400">
          {churchId
            ? `Registered church id: ${churchId}`
            : "No first-church-demo organization found yet."}
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-medium text-slate-100">Run seed</h2>
        <p className="text-sm text-slate-400">
          Idempotent upsert for First Church of the First Church. Type{" "}
          <span className="font-mono text-amber-200">SEED</span> to confirm.
          Temporary passwords come from{" "}
          <code className="font-mono text-xs">DEMO_SEED_TEMP_PASSWORD</code> and
          are never displayed.
        </p>
        <form action={seedAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm text-slate-300">
            Confirmation
            <input
              name="confirm"
              autoComplete="off"
              disabled={!environmentAllowed || seedPending}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="SEED"
            />
          </label>
          <PlatformButton
            type="submit"
            disabled={!environmentAllowed || seedPending}
          >
            {seedPending ? "Seeding…" : "Run demo seed"}
          </PlatformButton>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-red-950/50 bg-red-950/10 p-5">
        <h2 className="text-sm font-medium text-red-100">Cleanup seed data</h2>
        <p className="text-sm text-slate-400">
          Deletes only records tagged{" "}
          <code className="font-mono text-xs">first-church-demo</code>. Preserves
          the platform admin account; removes only that account&apos;s membership
          in this demo church. Type{" "}
          <span className="font-mono text-red-200">CLEANUP</span> to confirm.
        </p>
        <form
          action={cleanupAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="flex-1 text-sm text-slate-300">
            Confirmation
            <input
              name="confirm"
              autoComplete="off"
              disabled={!environmentAllowed || cleanupPending}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="CLEANUP"
            />
          </label>
          <PlatformButton
            type="submit"
            variant="destructive"
            disabled={!environmentAllowed || cleanupPending}
          >
            {cleanupPending ? "Cleaning…" : "Cleanup demo data"}
          </PlatformButton>
        </form>
      </section>

      <ResultPanel result={result} />
    </div>
  );
}

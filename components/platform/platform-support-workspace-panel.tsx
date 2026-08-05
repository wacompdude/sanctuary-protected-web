"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  lookupChurchesForSupportAction,
  startPlatformSupportSessionAction,
} from "@/app/platform/actions";
import {
  SUPPORT_SESSION_ACCESS_TYPES,
  SUPPORT_SESSION_DURATION_OPTIONS,
} from "@/lib/platform/support-session-options";

type ChurchHit = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
};

export function PlatformSupportWorkspacePanel({
  initialChurchId,
  initialChurchName,
}: {
  initialChurchId?: string | null;
  initialChurchName?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialChurchName ?? "");
  const [hits, setHits] = useState<ChurchHit[]>(
    initialChurchId && initialChurchName
      ? [
          {
            id: initialChurchId,
            name: initialChurchName,
            slug: null,
            status: null,
          },
        ]
      : [],
  );
  const [selectedChurchId, setSelectedChurchId] = useState(
    initialChurchId ?? "",
  );
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState("");
  const [accessType, setAccessType] = useState("read_only");
  const [duration, setDuration] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await lookupChurchesForSupportAction(query);
      if (result.error) {
        setError(result.error);
        setHits([]);
        return;
      }
      setHits(result.churches ?? []);
      if ((result.churches ?? []).length === 1) {
        setSelectedChurchId(result.churches![0].id);
      }
    });
  }

  function startSession() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("organization_id", selectedChurchId);
    formData.set("reason", reason);
    formData.set("ticket_reference", ticket);
    formData.set("access_type", accessType);
    formData.set("duration_minutes", duration);

    startTransition(async () => {
      const result = await startPlatformSupportSessionAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Support session started.");
      setReason("");
      router.refresh();
      if (selectedChurchId) {
        router.push(`/platform/churches/${selectedChurchId}`);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div>
        <h2 className="text-sm font-medium text-slate-200">
          Start a support session
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Look up a church by name, slug, or id. Sessions expire automatically
          and show a console banner while active.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-[16rem] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          placeholder="Church name, slug, or UUID"
        />
        <button
          type="button"
          disabled={pending || query.trim().length < 2}
          onClick={search}
          className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-40"
        >
          {pending ? "Searching…" : "Search"}
        </button>
      </div>

      {hits.length > 0 ? (
        <ul className="space-y-2">
          {hits.map((church) => (
            <li key={church.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm hover:bg-slate-950/60">
                <input
                  type="radio"
                  name="church"
                  checked={selectedChurchId === church.id}
                  onChange={() => setSelectedChurchId(church.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-slate-100">
                    {church.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {church.slug || church.id}
                    {church.status ? ` · ${church.status}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Reason</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-400">Ticket reference</span>
        <input
          value={ticket}
          onChange={(event) => setTicket(event.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Access type</span>
          <select
            value={accessType}
            onChange={(event) => setAccessType(event.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          >
            {SUPPORT_SESSION_ACCESS_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Duration</span>
          <select
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          >
            {SUPPORT_SESSION_DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        disabled={
          pending || !selectedChurchId || reason.trim().length < 8
        }
        onClick={startSession}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
      >
        {pending ? "Working…" : "Start support session"}
      </button>

      {error ? (
        <p className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {message}{" "}
          {selectedChurchId ? (
            <Link
              href={`/platform/churches/${selectedChurchId}`}
              className="underline"
            >
              Open church
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

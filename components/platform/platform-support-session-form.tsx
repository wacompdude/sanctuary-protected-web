"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  endPlatformSupportSessionAction,
  startPlatformSupportSessionAction,
} from "@/app/platform/actions";
import {
  SUPPORT_SESSION_ACCESS_TYPES,
  SUPPORT_SESSION_DURATION_OPTIONS,
} from "@/lib/platform/support-session-options";

export function PlatformSupportSessionForm({
  churchId,
  churchName,
  canStart,
  activeSessionId,
}: {
  churchId: string;
  churchName: string;
  canStart: boolean;
  activeSessionId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState("");
  const [accessType, setAccessType] = useState("read_only");
  const [duration, setDuration] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!canStart && !activeSessionId) return null;

  function startSession() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("organization_id", churchId);
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
    });
  }

  function endSession() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    if (activeSessionId) formData.set("session_id", activeSessionId);

    startTransition(async () => {
      const result = await endPlatformSupportSessionAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Support session ended.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div>
        <h2 className="text-sm font-medium text-slate-200">Support access</h2>
        <p className="mt-1 text-xs text-slate-500">
          Church-scoped session for {churchName}. Does not create a church
          membership or impersonate a user. MFA and a recent sign-in are
          required.
        </p>
      </div>

      {activeSessionId ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-200">
            You have an active support session for this church.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/platform/churches/${churchId}`}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-900"
            >
              Open church workspace
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={endSession}
              className="rounded-md border border-rose-800 px-3 py-1.5 text-sm text-rose-200 disabled:opacity-40"
            >
              {pending ? "Ending…" : "End session"}
            </button>
          </div>
        </div>
      ) : canStart ? (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              placeholder="Why is support access needed?"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">
              Ticket reference (optional)
            </span>
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
            disabled={pending || reason.trim().length < 8}
            onClick={startSession}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
          >
            {pending ? "Starting…" : "Start support session"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveCheckoutPilotAction,
  revokeCheckoutPilotAction,
} from "@/app/platform/actions";

export function PlatformCheckoutPilotPanel({
  organizationId,
  churchName,
  canManage,
  approvalStatus,
  approvedAt,
  expiresAt,
  notes,
  events,
}: {
  organizationId: string;
  churchName: string;
  canManage: boolean;
  approvalStatus: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  events: Array<{
    id: string;
    eventType: string;
    reason: string | null;
    createdAt: string;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [notesInput, setNotesInput] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function approve() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("organization_id", organizationId);
    formData.set("reason", reason);
    if (expiresAtInput.trim()) formData.set("expires_at", expiresAtInput.trim());
    if (notesInput.trim()) formData.set("notes", notesInput.trim());
    startTransition(async () => {
      const result = await approveCheckoutPilotAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Approved.");
      setReason("");
      router.refresh();
    });
  }

  function revoke() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("organization_id", organizationId);
    formData.set("reason", reason);
    startTransition(async () => {
      const result = await revokeCheckoutPilotAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Revoked.");
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div>
        <h2 className="text-sm font-medium text-slate-200">
          Live Checkout pilot access
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Approves {churchName} for Live subscription Checkout only when the
          global Checkout gate is also enabled. Ordinary owners cannot
          self-approve.
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd className="font-medium text-slate-200">
            {approvalStatus ?? "not approved"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Approved at</dt>
          <dd className="text-slate-300">
            {approvedAt ? new Date(approvedAt).toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Expires</dt>
          <dd className="text-slate-300">
            {expiresAt ? new Date(expiresAt).toLocaleString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Notes</dt>
          <dd className="text-slate-300">{notes || "—"}</dd>
        </div>
      </dl>

      {canManage ? (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <label className="block text-sm text-slate-300">
            Reason (required, audited)
            <textarea
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Operator reason for approve/revoke"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Optional expiration (ISO or local datetime)
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={expiresAtInput}
              onChange={(e) => setExpiresAtInput(e.target.value)}
              placeholder="2026-12-31T23:59:59.000Z"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Optional notes
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length < 8}
              onClick={approve}
              className="rounded-md bg-amber-500/90 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
            >
              {pending ? "Working…" : "Approve pilot Checkout"}
            </button>
            <button
              type="button"
              disabled={pending || reason.trim().length < 8}
              onClick={revoke}
              className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              Revoke approval
            </button>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-400">{message}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Requires billing.checkout_pilot.manage to change approvals.
        </p>
      )}

      <div className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Approval history
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No approval events yet.</p>
        ) : (
          <ul className="space-y-1 text-sm text-slate-300">
            {events.map((event) => (
              <li key={event.id}>
                {new Date(event.createdAt).toLocaleString()} — {event.eventType}
                {event.reason ? `: ${event.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

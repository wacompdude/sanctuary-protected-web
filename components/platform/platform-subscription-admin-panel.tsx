"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyPlatformPlanChangeAction,
  cancelPlatformSubscriptionAction,
  previewPlatformPlanChangeAction,
  restorePlatformSubscriptionAction,
} from "@/app/platform/actions";
import type { DowngradeImpactReport } from "@/lib/billing/types";

type PlanOption = {
  plan_key: string;
  display_name: string;
  monthly_price_cents: number | null;
  status: string;
};

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function PlatformSubscriptionAdminPanel({
  churchId,
  churchName,
  currentPlanKey,
  cancelAtPeriodEnd,
  subscriptionStatus,
  plans,
  providerMessage,
  canChangePlan,
  canCancel,
  canRestore,
}: {
  churchId: string;
  churchName: string;
  currentPlanKey: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionStatus: string | null;
  plans: PlanOption[];
  providerMessage: string;
  canChangePlan: boolean;
  canCancel: boolean;
  canRestore: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedPlanKey, setSelectedPlanKey] = useState(
    currentPlanKey ?? plans[0]?.plan_key ?? "",
  );
  const [impact, setImpact] = useState<DowngradeImpactReport | null>(null);
  const [reason, setReason] = useState("");
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTyped, setCancelTyped] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [restoreReason, setRestoreReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function runPreview(planKey: string) {
    setSelectedPlanKey(planKey);
    setConfirmDowngrade(false);
    setTypedConfirmation("");
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await previewPlatformPlanChangeAction(churchId, planKey);
      if (result.error) {
        setError(result.error);
        setImpact(null);
        return;
      }
      setImpact(result.impact ?? null);
    });
  }

  function applyPlan() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("church_id", churchId);
    formData.set("plan_key", selectedPlanKey);
    formData.set("reason", reason);
    if (confirmDowngrade) formData.set("confirm_downgrade", "1");
    if (typedConfirmation) formData.set("typed_confirmation", typedConfirmation);

    startTransition(async () => {
      const result = await applyPlatformPlanChangeAction({}, formData);
      if (result.error) {
        setError(result.error);
        if (result.impact) setImpact(result.impact);
        return;
      }
      setMessage(result.message ?? "Plan updated.");
      setImpact(result.impact ?? null);
      setReason("");
      setConfirmDowngrade(false);
      setTypedConfirmation("");
      router.refresh();
    });
  }

  function cancelSubscription() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("church_id", churchId);
    formData.set("reason", cancelReason);
    if (cancelConfirm) formData.set("confirm", "1");
    formData.set("typed_confirmation", cancelTyped);

    startTransition(async () => {
      const result = await cancelPlatformSubscriptionAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Cancellation scheduled.");
      setCancelReason("");
      setCancelTyped("");
      setCancelConfirm(false);
      router.refresh();
    });
  }

  function restoreSubscription() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("church_id", churchId);
    formData.set("reason", restoreReason);

    startTransition(async () => {
      const result = await restorePlatformSubscriptionAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Subscription restored.");
      setRestoreReason("");
      router.refresh();
    });
  }

  const needsTypedName =
    Boolean(impact?.isDowngrade) && !Boolean(impact?.isSamePlan);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">{providerMessage}</p>

      {canChangePlan ? (
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <div>
            <h2 className="text-sm font-medium text-slate-200">Change plan</h2>
            <p className="mt-1 text-xs text-slate-500">
              Requires MFA and a recent session. Downgrades keep existing data
              and need typed church-name confirmation.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const key = plan.plan_key;
              const selected = selectedPlanKey === key;
              const current = currentPlanKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={pending}
                  onClick={() => runPreview(key)}
                  className={`rounded-md border p-3 text-left text-sm transition ${
                    selected
                      ? "border-amber-600/60 bg-amber-950/20"
                      : "border-slate-700 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-100">
                      {plan.display_name}
                    </span>
                    {current ? (
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-slate-400">
                    {formatPrice(plan.monthly_price_cents)}
                    {plan.status !== "active" ? (
                      <span className="ml-1 text-xs text-amber-400/80">
                        ({plan.status})
                      </span>
                    ) : null}
                  </p>
                </button>
              );
            })}
          </div>

          {impact ? (
            <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950/50 p-4">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Impact preview
                </p>
                <p className="mt-1 text-sm text-slate-400">{impact.summary}</p>
                {impact.blocking ? (
                  <p className="mt-2 text-xs text-amber-300">
                    Usage is over the target plan limits. Existing data is kept;
                    some writes may be blocked after change.
                  </p>
                ) : null}
              </div>

              {impact.items.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {impact.items.map((item) => (
                    <li
                      key={`${item.kind}:${item.featureKey}`}
                      className="rounded border border-slate-800 px-3 py-2"
                    >
                      <p className="font-medium text-slate-200">{item.label}</p>
                      <p className="text-slate-400">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : null}

              <label className="block text-sm">
                <span className="mb-1 block text-slate-400">
                  Administrative reason
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  required
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  placeholder="Why is this plan being changed?"
                />
              </label>

              {needsTypedName ? (
                <>
                  <label className="flex items-start gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={confirmDowngrade}
                      onChange={(event) =>
                        setConfirmDowngrade(event.target.checked)
                      }
                      className="mt-1"
                    />
                    <span>
                      I confirm this downgrade. Existing church data is kept;
                      some writes may be blocked.
                    </span>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-400">
                      Type church name to confirm:{" "}
                      <span className="text-slate-200">{churchName}</span>
                    </span>
                    <input
                      value={typedConfirmation}
                      onChange={(event) =>
                        setTypedConfirmation(event.target.value)
                      }
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
                      autoComplete="off"
                    />
                  </label>
                </>
              ) : null}

              <button
                type="button"
                disabled={
                  pending ||
                  impact.isSamePlan ||
                  reason.trim().length < 8 ||
                  (needsTypedName &&
                    (!confirmDowngrade ||
                      typedConfirmation.trim().toLowerCase() !==
                        churchName.trim().toLowerCase()))
                }
                onClick={applyPlan}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending
                  ? "Working…"
                  : impact.isDowngrade
                    ? "Apply downgrade"
                    : "Apply plan change"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Select a plan to preview impact before applying.
            </p>
          )}
        </div>
      ) : null}

      {canCancel && !cancelAtPeriodEnd ? (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-sm font-medium text-slate-200">
            Cancel at period end
          </h2>
          <p className="text-xs text-slate-500">
            Church data is never deleted by cancellation.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Reason</span>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={cancelConfirm}
              onChange={(event) => setCancelConfirm(event.target.checked)}
              className="mt-1"
            />
            <span>Confirm schedule cancellation at period end.</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">
              Type church name:{" "}
              <span className="text-slate-200">{churchName}</span>
            </span>
            <input
              value={cancelTyped}
              onChange={(event) => setCancelTyped(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            disabled={
              pending ||
              !cancelConfirm ||
              cancelReason.trim().length < 8 ||
              cancelTyped.trim().toLowerCase() !==
                churchName.trim().toLowerCase()
            }
            onClick={cancelSubscription}
            className="rounded-md border border-rose-800 px-4 py-2 text-sm text-rose-200 disabled:opacity-40"
          >
            {pending ? "Working…" : "Schedule cancellation"}
          </button>
        </div>
      ) : null}

      {cancelAtPeriodEnd ? (
        <p className="text-sm text-amber-300/90">
          Cancellation is already scheduled for period end.
        </p>
      ) : null}

      {canRestore &&
      (subscriptionStatus === "cancelled" ||
        subscriptionStatus === "suspended" ||
        subscriptionStatus === "expired") ? (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-sm font-medium text-slate-200">
            Restore subscription
          </h2>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">Reason</span>
            <textarea
              value={restoreReason}
              onChange={(event) => setRestoreReason(event.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={pending || restoreReason.trim().length < 8}
            onClick={restoreSubscription}
            className="rounded-md border border-emerald-800 px-4 py-2 text-sm text-emerald-200 disabled:opacity-40"
          >
            {pending ? "Working…" : "Restore to active"}
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

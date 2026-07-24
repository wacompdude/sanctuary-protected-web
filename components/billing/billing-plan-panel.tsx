"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyPlanWithoutProviderAction,
  openCustomerPortalAction,
  previewPlanChangeImpactAction,
  requestCancellationAction,
  startCheckoutAction,
} from "@/app/(app)/settings/billing/actions";
import { Button } from "@/components/ui/button";
import type { DowngradeImpactReport } from "@/lib/billing/types";
import type { SubscriptionPlanRecord } from "@/lib/subscriptions/types";

function formatPrice(cents: number | null, currency: string): string {
  if (cents === null || cents === undefined) return "Contact us";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

export function BillingPlanPanel({
  plans,
  currentPlanKey,
  providerReady,
  providerMessage,
  cancelAtPeriodEnd,
}: {
  plans: SubscriptionPlanRecord[];
  currentPlanKey: string | null;
  providerReady: boolean;
  providerMessage: string;
  cancelAtPeriodEnd: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedPlanKey, setSelectedPlanKey] = useState(
    currentPlanKey ?? plans[0]?.plan_key ?? "",
  );
  const [impact, setImpact] = useState<DowngradeImpactReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);

  function runPreview(planKey: string) {
    setSelectedPlanKey(planKey);
    setConfirmDowngrade(false);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await previewPlanChangeImpactAction(String(planKey));
      if (result.error) {
        setError(result.error);
        setImpact(null);
        return;
      }
      setImpact(result.impact ?? null);
    });
  }

  function applySelectedPlan() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("plan_key", String(selectedPlanKey));
    if (confirmDowngrade) formData.set("confirmed", "1");

    startTransition(async () => {
      if (providerReady) {
        const result = await startCheckoutAction({}, formData);
        if (result.url) {
          window.location.href = result.url;
          return;
        }
        setError(result.error ?? "Unable to start checkout.");
        if (result.impact) setImpact(result.impact);
        return;
      }

      const result = await applyPlanWithoutProviderAction({}, formData);
      if (result.error) {
        setError(result.error);
        if (result.impact) setImpact(result.impact);
        return;
      }
      setMessage(result.message ?? "Plan updated.");
      setImpact(result.impact ?? null);
      router.refresh();
    });
  }

  function openPortal() {
    setError(null);
    startTransition(async () => {
      const result = await openCustomerPortalAction();
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? "Customer portal is unavailable.");
    });
  }

  function requestCancel() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("confirmed", "1");
    startTransition(async () => {
      const result = await requestCancellationAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Cancellation scheduled.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{providerMessage}</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const key = String(plan.plan_key);
          const selected = selectedPlanKey === key;
          const current = currentPlanKey === key;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => runPreview(key)}
              className={`rounded-lg border p-4 text-left transition ${
                selected
                  ? "border-foreground bg-muted/40"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{plan.display_name}</h3>
                {current ? (
                  <span className="text-xs text-muted-foreground">Current</span>
                ) : null}
              </div>
              <p className="mt-2 text-lg font-semibold">
                {formatPrice(plan.monthly_price_cents, plan.currency)}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}
                  / {plan.billing_interval}
                </span>
              </p>
              {plan.description ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {plan.description}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      {impact ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <h3 className="text-sm font-medium">Plan change review</h3>
            <p className="mt-1 text-sm text-muted-foreground">{impact.summary}</p>
          </div>
          {impact.items.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {impact.items.map((item) => (
                <li
                  key={`${item.kind}:${item.featureKey}`}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <p className="font-medium">{item.label}</p>
                  <p className="text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {impact.isDowngrade && !impact.isSamePlan ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmDowngrade}
                onChange={(event) => setConfirmDowngrade(event.target.checked)}
                className="mt-1"
              />
              <span>
                I understand existing data is kept, and some writes may be blocked
                after downgrade.
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                pending ||
                impact.isSamePlan ||
                (impact.isDowngrade && !confirmDowngrade)
              }
              onClick={applySelectedPlan}
            >
              {pending
                ? "Working…"
                : providerReady
                  ? "Continue to checkout"
                  : impact.isDowngrade
                    ? "Apply downgrade"
                    : "Apply plan"}
            </Button>
            {providerReady ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={openPortal}
              >
                Open customer portal
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Cancellation</h3>
        <p className="text-sm text-muted-foreground">
          Cancel at period end. Church data, campuses, inventory, and history are
          never deleted by cancellation.
        </p>
        {cancelAtPeriodEnd ? (
          <p className="text-sm">Cancellation is already scheduled for this period.</p>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={requestCancel}
          >
            {pending ? "Working…" : "Cancel at period end"}
          </Button>
        )}
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-green-700 dark:text-green-400">{message}</p>
      ) : null}
    </div>
  );
}

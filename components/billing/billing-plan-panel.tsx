"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  applyPlanWithoutProviderAction,
  confirmSubscriptionUpgradeAction,
  openCustomerPortalAction,
  previewPlanChangeImpactAction,
  previewSubscriptionUpgradeAction,
  requestCancellationAction,
  scheduleSubscriptionDowngradeAction,
  cancelScheduledDowngradeAction,
  startCheckoutAction,
} from "@/app/(app)/settings/billing/actions";
import { Button } from "@/components/ui/button";
import {
  canStartInitialSubscriptionCheckout,
  connectedSubscriptionPlanAction,
  completedUpgradeReviewIsCurrent,
  formatBillingPlanPrice,
  initialSamePlanCheckoutSummary,
} from "@/lib/billing/checkout-eligibility";
import type { SubscriptionUpgradePreview } from "@/lib/billing/stripe/upgrade";
import type { DowngradeImpactReport } from "@/lib/billing/types";
import { isPlanDowngrade, isPlanUpgrade } from "@/lib/subscriptions/status";
import type { SubscriptionPlanRecord } from "@/lib/subscriptions/types";

export function BillingPlanPanel({
  plans,
  currentPlanKey,
  hasProviderSubscription,
  providerReady,
  providerMessage,
  cancelAtPeriodEnd,
  canManageBilling = true,
  scheduledDowngrade = null,
}: {
  plans: SubscriptionPlanRecord[];
  currentPlanKey: string | null;
  /** True when organization_subscriptions.billing_subscription_id is set. */
  hasProviderSubscription: boolean;
  providerReady: boolean;
  providerMessage: string;
  cancelAtPeriodEnd: boolean;
  canManageBilling?: boolean;
  scheduledDowngrade?: {
    currentPlanName: string;
    targetPlanKey: string;
    targetPlanName: string;
    effectiveAt: string;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedPlanKey, setSelectedPlanKey] = useState(
    currentPlanKey ?? plans[0]?.plan_key ?? "",
  );
  const [impact, setImpact] = useState<DowngradeImpactReport | null>(null);
  const [upgradePreview, setUpgradePreview] =
    useState<SubscriptionUpgradePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDowngrade, setConfirmDowngrade] = useState(false);

  function runPreview(planKey: string) {
    setSelectedPlanKey(planKey);
    setConfirmDowngrade(false);
    setUpgradePreview(null);
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
      const action = connectedSubscriptionPlanAction({
        hasProviderSubscription,
        isSamePlan: result.impact?.isSamePlan ?? false,
        isUpgrade: result.impact?.isUpgrade ?? false,
        isDowngrade: result.impact?.isDowngrade ?? false,
      });
      if (action === "upgrade" && providerReady) {
        const preview = await previewSubscriptionUpgradeAction(String(planKey));
        if (preview.error) {
          setError(preview.error);
          setUpgradePreview(null);
          return;
        }
        setUpgradePreview(preview.upgradePreview ?? null);
      }
    });
  }

  function applySelectedPlan() {
    if (hasProviderSubscription) return;
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

  function confirmUpgrade() {
    if (scheduledDowngrade) {
      setError(
        "You currently have a plan downgrade scheduled. Cancel the scheduled downgrade before upgrading to another plan.",
      );
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await confirmSubscriptionUpgradeAction(
        String(selectedPlanKey),
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Upgrade payment succeeded.");
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

  function scheduleDowngrade() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await scheduleSubscriptionDowngradeAction(
        String(selectedPlanKey),
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Downgrade scheduled.");
      router.refresh();
    });
  }

  function cancelScheduledDowngrade() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await cancelScheduledDowngradeAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Scheduled downgrade canceled.");
      router.refresh();
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

  const allowInitialSamePlanCheckout =
    impact != null &&
    canStartInitialSubscriptionCheckout({
      isSamePlan: impact.isSamePlan,
      hasProviderSubscription,
      checkoutAvailable: providerReady,
    });

  const completedReviewIsCurrent = completedUpgradeReviewIsCurrent({
    hasProviderSubscription,
    currentPlanKey,
    selectedPlanKey,
    impactSaysUpgrade: Boolean(impact?.isUpgrade),
  });

  const planAction = completedReviewIsCurrent
    ? "current"
    : impact
      ? connectedSubscriptionPlanAction({
          hasProviderSubscription,
          isSamePlan: impact.isSamePlan,
          isUpgrade: impact.isUpgrade,
          isDowngrade: impact.isDowngrade,
        })
      : null;

  const checkoutDisabled =
    pending ||
    !impact ||
    hasProviderSubscription ||
    (impact.isSamePlan && !allowInitialSamePlanCheckout) ||
    (impact.isDowngrade && !impact.isSamePlan && !confirmDowngrade);

  const reviewSummary =
    planAction === "upgrade" && upgradePreview
      ? `Upgrade to ${upgradePreview.targetPlanName}. Your upgrade will take effect immediately. ${upgradePreview.creditStatement} Your normal monthly renewal date will remain unchanged.`
      : planAction === "schedule_downgrade"
        ? `Downgrade to ${impact?.toPlanDisplayName ?? "the selected plan"}. No refund will be issued for the current paid period.`
        : impact?.isSamePlan && !hasProviderSubscription && providerReady
          ? initialSamePlanCheckoutSummary()
          : impact?.summary;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{providerMessage}</p>
      {scheduledDowngrade ? (
        <div className="rounded-lg border border-border p-4 space-y-2 text-sm">
          <h3 className="font-medium">Scheduled downgrade</h3>
          <p>Current plan: {scheduledDowngrade.currentPlanName}</p>
          <p>New plan: {scheduledDowngrade.targetPlanName}</p>
          <p>
            Effective:{" "}
            {new Date(scheduledDowngrade.effectiveAt).toLocaleDateString(
              "en-US",
              { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" },
            )}
          </p>
          <p>Until then, {scheduledDowngrade.currentPlanName} remains active.</p>
          {canManageBilling ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={cancelScheduledDowngrade}
            >
              {pending ? "Working…" : "Cancel scheduled downgrade"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Plan prices, billing frequency, automatic renewal (when a payment
        processor is connected), cancellation, and refunds are described in our{" "}
        <Link href="/billing" className="underline underline-offset-4">
          Billing &amp; Subscription Policy
        </Link>
        . Also see our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const key = String(plan.plan_key);
          const selected = selectedPlanKey === key;
          const current = currentPlanKey === key;
          const planAction = connectedSubscriptionPlanAction({
            hasProviderSubscription,
            isSamePlan: current,
            isUpgrade: Boolean(
              currentPlanKey && isPlanUpgrade(currentPlanKey, key),
            ),
            isDowngrade: Boolean(
              currentPlanKey && isPlanDowngrade(currentPlanKey, key),
            ),
          });
          const scheduled =
            scheduledDowngrade?.targetPlanKey === key && !current;
          const planLabel = current
            ? "Current"
            : scheduled
              ? "Scheduled"
              : planAction === "upgrade"
                ? "Upgrade"
                : planAction === "schedule_downgrade"
                  ? "Downgrade at next renewal"
                  : null;
          return (
            <button
              key={plan.id}
              type="button"
              disabled={!canManageBilling}
              onClick={() => {
                if (!canManageBilling) return;
                runPreview(key);
              }}
              className={`rounded-lg border p-4 text-left transition ${
                selected
                  ? "border-foreground bg-muted/40"
                  : "border-border hover:border-foreground/40"
              } ${!canManageBilling ? "cursor-default opacity-90" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{plan.display_name}</h3>
                {planLabel ? (
                  <span className="text-xs text-muted-foreground">{planLabel}</span>
                ) : null}
              </div>
              <p className="mt-2 text-lg font-semibold">
                {formatBillingPlanPrice(plan.monthly_price_cents, plan.currency)}
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

      {impact && !completedReviewIsCurrent ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <h3 className="text-sm font-medium">Plan change review</h3>
            <p className="mt-1 text-sm text-muted-foreground">{reviewSummary}</p>
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

          {planAction === "upgrade" && upgradePreview && !completedReviewIsCurrent ? (
            <div className="space-y-1 text-sm">
              <p>Upgrade to {upgradePreview.targetPlanName}</p>
              <p>Your upgrade will take effect immediately.</p>
              <p>{upgradePreview.creditStatement}</p>
              <p>Your normal monthly renewal date will remain unchanged.</p>
              <p>
                Amount due today:{" "}
                {formatBillingPlanPrice(
                  upgradePreview.amountDueCents,
                  upgradePreview.currency,
                )}
              </p>
              <p>
                Then{" "}
                {formatBillingPlanPrice(
                  upgradePreview.targetMonthlyPriceCents,
                  upgradePreview.currency,
                )}{" "}
                / month. Renewal{" "}
                {new Date(upgradePreview.renewalAt).toLocaleDateString()}.
              </p>
            </div>
          ) : null}

          {planAction === "schedule_downgrade" && impact ? (
            <div className="space-y-1 text-sm">
              <p>Downgrade to {impact.toPlanDisplayName}</p>
              <p>
                Effective:{" "}
                {scheduledDowngrade
                  ? new Date(scheduledDowngrade.effectiveAt).toLocaleDateString(
                      "en-US",
                      {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )
                  : "the next renewal"}
              </p>
              <p>Until then: {impact.fromPlanDisplayName} remains active.</p>
              {impact.targetMonthlyPriceCents != null ? (
                <p>
                  New monthly price:{" "}
                  {formatBillingPlanPrice(impact.targetMonthlyPriceCents, "usd")}
                </p>
              ) : null}
              <p>
                User limit: {impact.currentUserLimit ?? "current"} →{" "}
                {impact.targetUserLimit ?? "target"}
              </p>
              <p>
                Included monthly SMS: {impact.currentSmsLimit ?? 0} →{" "}
                {impact.targetSmsLimit ?? 0}
              </p>
              {impact.activeSeats != null &&
              impact.targetUserLimit != null &&
              impact.activeSeats > impact.targetUserLimit ? (
                <p>
                  Current active users: {impact.activeSeats}. {impact.toPlanDisplayName}{" "}
                  limit: {impact.targetUserLimit}. After the downgrade takes effect,
                  existing users remain, but new invitations cannot be accepted until
                  usage is within the plan limit.
                </p>
              ) : null}
              <p>No refund will be issued for the current paid period.</p>
            </div>
          ) : null}

          {impact.isDowngrade && !impact.isSamePlan && !hasProviderSubscription ? (
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
            {canManageBilling ? (
              <>
                {planAction === "upgrade" ? (
                  <Button
                    type="button"
                    disabled={pending || !upgradePreview || Boolean(scheduledDowngrade)}
                    onClick={confirmUpgrade}
                  >
                    {pending ? "Working…" : "Confirm Upgrade"}
                  </Button>
                ) : planAction === "schedule_downgrade" && !scheduledDowngrade ? (
                  <Button
                    type="button"
                    disabled={pending || !providerReady}
                    onClick={scheduleDowngrade}
                  >
                    {pending ? "Working…" : "Schedule Downgrade"}
                  </Button>
                ) : planAction === "current" || planAction === "schedule_downgrade" ? null : (
                  <Button
                    type="button"
                    disabled={checkoutDisabled}
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
                )}
                {providerReady && !hasProviderSubscription ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={openPortal}
                  >
                    Open customer portal
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Plan changes, checkout, and payment methods are available to
                owners and co-owners.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Cancellation</h3>
        <p className="text-sm text-muted-foreground">
          Cancel at period end. Church data, campuses, inventory, and history are
          never deleted by cancellation.
        </p>
        {!canManageBilling ? (
          <p className="text-sm text-muted-foreground">
            Only owners and co-owners can schedule cancellation.
          </p>
        ) : cancelAtPeriodEnd ? (
          <p className="text-sm">Cancellation is already scheduled for this period.</p>
        ) : scheduledDowngrade ? (
          <p className="text-sm">
            Cancel the scheduled plan downgrade before canceling the subscription.
          </p>
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

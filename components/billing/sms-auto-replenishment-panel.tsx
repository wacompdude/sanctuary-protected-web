"use client";

import { useState, useTransition } from "react";
import {
  disableSmsAutoReplenishmentAction,
  enableSmsAutoReplenishmentAction,
  reauthorizeSmsAutoReplenishmentAction,
  resolveSmsAutoReplenishmentTaxAttentionAction,
  resumeSmsAutoReplenishmentAction,
} from "@/app/(app)/settings/billing/sms-auto-replenishment-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBillingPlanPrice } from "@/lib/billing/checkout-eligibility";
import {
  SMS_AUTO_REPLENISHMENT_AUTHORIZATION_TEXT,
  SMS_AUTO_REPLENISHMENT_SPEND_CHOICES_CENTS,
  customerSmsAutoReplenishmentStatus,
  spendCapIsValid,
} from "@/lib/billing/sms-auto-replenishment";

export function SmsAutoReplenishmentPanel({
  canManage,
  status,
  threshold,
  capCents,
  packageCredits,
  packagePriceCents,
  suggestedThreshold,
}: {
  canManage: boolean;
  status: string | null;
  threshold: number | null;
  capCents: number | null;
  packageCredits: number | null;
  packagePriceCents: number | null;
  suggestedThreshold: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = status ?? "disabled";
  const choices = SMS_AUTO_REPLENISHMENT_SPEND_CHOICES_CENTS.filter((choice) =>
    packagePriceCents ? spendCapIsValid(packagePriceCents, choice) : true,
  );
  const defaultCap = choices.includes(2_500) ? 2_500 : choices[0];
  const defaultThreshold =
    suggestedThreshold &&
    packageCredits &&
    suggestedThreshold >= 1 &&
    suggestedThreshold < packageCredits
      ? suggestedThreshold
      : 1;

  function run(action: () => Promise<{ error?: string; ok?: boolean }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <section className="space-y-3 rounded-md border border-border px-3 py-3">
      <div>
        <h2 className="text-sm font-medium">Automatic SMS Replenishment</h2>
        <p className="mt-1 text-sm">{customerSmsAutoReplenishmentStatus(status)}</p>
      </div>

      {current === "payment_attention_required" ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Automatic SMS replenishment is paused because the saved payment method
          needs attention. No further automatic charge will be attempted until you
          update the payment method and resume automatic replenishment. Application
          SMS may become unavailable if your available credits run out.
        </div>
      ) : null}

      {current === "authorization_review_required" ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Automatic replenishment stopped because the current SMS package price is
          higher than the price you previously authorized.
        </div>
      ) : null}

      {current === "tax_attention_required" ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Automatic replenishment is paused because the billing address cannot
          currently be used to calculate sales tax. This is not a tax-free purchase.{" "}
          <a className="underline" href="#billing-address">
            Review Billing &amp; Tax Address
          </a>
          .
        </div>
      ) : null}

      {packageCredits && packagePriceCents ? (
        <p className="text-sm">
          {packageCredits} Application SMS credits · {formatBillingPlanPrice(packagePriceCents)} per
          package, plus applicable sales tax.
        </p>
      ) : null}

      {threshold ? (
        <p className="text-sm text-muted-foreground">
          Current threshold: {threshold} credits. Current spending limit:{" "}
          {capCents ? formatBillingPlanPrice(capCents) : "not set"}.
        </p>
      ) : null}

      {canManage && (current === "disabled" || status === null) && packageCredits ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => enableSmsAutoReplenishmentAction(data));
          }}
        >
          <label className="block text-sm">
            When available Application SMS credits reach:
            <Input
              className="mt-1 max-w-32"
              name="threshold"
              type="number"
              min={1}
              max={packageCredits - 1}
              defaultValue={defaultThreshold}
              required
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Buy another package when the application text credits you can still use
            are at or below this number.
          </p>
          <fieldset className="space-y-1">
            <legend className="text-sm">
              Maximum automatic SMS spending per subscription billing period
            </legend>
            {choices.map((choice) => (
              <label key={choice} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="spending_cap_cents"
                  value={choice}
                  defaultChecked={choice === defaultCap}
                  required
                />
                {formatBillingPlanPrice(choice)}
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">
            This limit includes the package price and sales tax. A purchase is made
            only when the package and its tax fit within the remaining limit.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" name="authorization" />
            <span>{SMS_AUTO_REPLENISHMENT_AUTHORIZATION_TEXT}</span>
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Enabling…" : "Enable Automatic Replenishment"}
          </Button>
        </form>
      ) : null}

      {canManage && current === "enabled" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Automatic purchases stop. The saved card remains available and is not charged.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(disableSmsAutoReplenishmentAction)}
          >
            Turn off automatic replenishment
          </Button>
        </div>
      ) : null}

      {canManage && current === "payment_attention_required" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Update the automatic SMS payment method below. Saving a card does not
            resume replenishment and does not charge the card.
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(resumeSmsAutoReplenishmentAction)}
          >
            Resume automatic replenishment
          </Button>
        </div>
      ) : null}

      {canManage && current === "authorization_review_required" ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => reauthorizeSmsAutoReplenishmentAction(data));
          }}
        >
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" name="authorization" />
            <span>{SMS_AUTO_REPLENISHMENT_AUTHORIZATION_TEXT}</span>
          </label>
          <Button type="submit" disabled={pending}>
            Reauthorize automatic replenishment
          </Button>
        </form>
      ) : null}

      {canManage && current === "tax_attention_required" ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => run(resolveSmsAutoReplenishmentTaxAttentionAction)}
        >
          Resume after the billing address is updated
        </Button>
      ) : null}

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Only an owner or co-owner can change automatic replenishment.
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

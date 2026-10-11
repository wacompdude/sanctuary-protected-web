"use client";

import { useState, useTransition } from "react";
import { startSmsPackageCheckoutAction } from "@/app/(app)/settings/billing/actions";
import { Button } from "@/components/ui/button";
import { formatBillingPlanPrice } from "@/lib/billing/checkout-eligibility";

export function SmsPackagePurchaseButton({
  credits,
  priceCents,
  providerReady,
  providerMessage,
}: {
  credits: number;
  priceCents: number;
  providerReady: boolean;
  providerMessage: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = `Buy ${credits} SMS Credits — ${formatBillingPlanPrice(priceCents)}`;

  function purchase() {
    setError(null);
    const formData = new FormData();
    formData.set("intent", "purchase_current_sms_package");
    startTransition(async () => {
      const result = await startSmsPackageCheckoutAction(formData);
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      setError(result.error ?? "Unable to start the SMS credit purchase.");
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={purchase} disabled={pending || !providerReady}>
        {pending ? "Opening Checkout…" : label}
      </Button>
      {!providerReady ? (
        <p className="text-xs text-muted-foreground">{providerMessage}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

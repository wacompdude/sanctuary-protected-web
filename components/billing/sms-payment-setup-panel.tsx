"use client";

import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  finalizeSmsPaymentSetupAction,
  removeSmsPaymentSetupAction,
  startSmsPaymentSetupAction,
} from "@/app/(app)/settings/billing/sms-payment-setup-actions";
import { Button } from "@/components/ui/button";
import {
  SMS_PAYMENT_METHOD_SAVED_NOTICE,
  type SafeCardDisplay,
} from "@/lib/billing/stripe/sms-payment-setup";

function brandLabel(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function CardSummary({ display }: { display: SafeCardDisplay }) {
  const month = String(display.expMonth).padStart(2, "0");
  const year = String(display.expYear).slice(-2);
  return (
    <p className="text-sm">
      {brandLabel(display.brand)} ending {display.last4}
      <span className="text-muted-foreground"> · Expires {month}/{year}</span>
    </p>
  );
}

function SetupForm({
  returnUrl,
  onSaved,
}: {
  returnUrl: string;
  onSaved: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!stripe || !elements) return;
    setError(null);
    startTransition(async () => {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (result.error) {
        setError(result.error.message ?? "Payment method setup was not completed.");
        return;
      }
      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        setError("Payment method setup was not completed.");
        return;
      }
      const saved = await finalizeSmsPaymentSetupAction(setupIntentId);
      if (saved.error) {
        setError(saved.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      <Button type="button" onClick={confirm} disabled={!stripe || !elements || pending}>
        {pending ? "Saving payment method…" : "Save payment method"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function SmsPaymentSetupPanel({
  canManage,
  status,
  hasPaymentMethod,
  display,
  publishableKey,
  returnedSetupIntentId,
}: {
  canManage: boolean;
  status: string | null;
  hasPaymentMethod: boolean;
  display: SafeCardDisplay | null;
  publishableKey: string | null;
  returnedSetupIntentId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(publishableKey);
  const stripePromise = useMemo(
    () => (activeKey ? loadStripe(activeKey) : null),
    [activeKey],
  );

  function begin() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const started = await startSmsPaymentSetupAction();
      if (started.error || !started.clientSecret || !started.publishableKey || !started.returnUrl) {
        setError(started.error ?? "Unable to start payment method setup.");
        return;
      }
      setActiveKey(started.publishableKey);
      setReturnUrl(started.returnUrl);
      setClientSecret(started.clientSecret);
    });
  }

  function remove() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const removed = await removeSmsPaymentSetupAction();
      if (removed.error) {
        setError(removed.error);
        return;
      }
      setClientSecret(null);
      setNotice("Automatic SMS payment method removed. No card was charged.");
    });
  }

  function notePaymentMethodSaved() {
    setClientSecret(null);
    setReturnUrl(null);
    setNotice(SMS_PAYMENT_METHOD_SAVED_NOTICE);
  }

  function finishReturnedSetup() {
    if (!returnedSetupIntentId) return;
    setError(null);
    startTransition(async () => {
      const saved = await finalizeSmsPaymentSetupAction(returnedSetupIntentId);
      if (saved.error) {
        setError(saved.error);
        return;
      }
      notePaymentMethodSaved();
    });
  }

  const replenishmentOff = status !== "enabled";

  return (
    <section className="space-y-3 rounded-md border border-border px-3 py-3">
      <div>
        <h2 className="text-sm font-medium">Payment method for automatic SMS credits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This card is used only for automatic Application SMS purchases.
          Changing it does not change the subscription card. Adding a payment
          method does not enable Auto-Replenishment and does not charge your card.
        </p>
      </div>
      {replenishmentOff ? (
        <p className="text-sm">Automatic replenishment is not enabled.</p>
      ) : (
        <p className="text-sm">
          This page cannot start an automatic charge.
        </p>
      )}
      {display ? <CardSummary display={display} /> : hasPaymentMethod ? (
        <p className="text-sm">A payment method is saved for automatic SMS credits.</p>
      ) : (
        <p className="text-sm text-muted-foreground">No automatic SMS payment method saved.</p>
      )}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={begin} disabled={pending}>
            {pending ? "Working…" : hasPaymentMethod ? "Replace payment method" : "Set up payment method"}
          </Button>
          {hasPaymentMethod ? (
            <Button type="button" variant="outline" onClick={remove} disabled={pending}>
              Remove auto-replenishment payment method
            </Button>
          ) : null}
          {returnedSetupIntentId ? (
            <Button type="button" variant="outline" onClick={finishReturnedSetup} disabled={pending}>
              Finish payment method setup
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only an owner or co-owner can set up the automatic SMS payment method.
        </p>
      )}
      {clientSecret && stripePromise && returnUrl ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <SetupForm returnUrl={returnUrl} onSaved={notePaymentMethodSaved} />
        </Elements>
      ) : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

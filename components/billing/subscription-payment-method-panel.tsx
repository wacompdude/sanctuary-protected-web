"use client";

import { useMemo, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  finalizeSubscriptionPaymentMethodSetupAction,
  startSubscriptionPaymentMethodSetupAction,
} from "@/app/(app)/settings/billing/subscription-payment-method-actions";
import { Button } from "@/components/ui/button";
import type { SafeCardDisplay } from "@/lib/billing/stripe/sms-payment-setup";
import type { SubscriptionPaymentMethodView } from "@/lib/billing/stripe/subscription-payment-method";
import { useRouter } from "next/navigation";

function brandLabel(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function CardSummary({ display }: { display: SafeCardDisplay }) {
  const month = String(display.expMonth).padStart(2, "0");
  return (
    <p className="text-sm">
      {brandLabel(display.brand)} •••• {display.last4}
      <span className="text-muted-foreground">
        {" "}
        · Expires {month}/{display.expYear}
      </span>
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
        setError("The card setup was not completed.");
        return;
      }
      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        setError("The card setup was not completed.");
        return;
      }
      const saved = await finalizeSubscriptionPaymentMethodSetupAction(setupIntentId);
      if (saved.error) {
        setError(saved.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This replaces the card used for the organization subscription. It does
        not change the plan, tax address, or automatic SMS payment method.
      </p>
      <PaymentElement />
      <Button type="button" onClick={confirm} disabled={!stripe || !elements || pending}>
        {pending ? "Saving payment method…" : "Save subscription payment method"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function SubscriptionPaymentMethodPanel({
  canManage,
  view,
  publishableKey,
  returnedSetupIntentId,
}: {
  canManage: boolean;
  view: SubscriptionPaymentMethodView;
  publishableKey: string | null;
  returnedSetupIntentId: string | null;
}) {
  const router = useRouter();
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
      const started = await startSubscriptionPaymentMethodSetupAction();
      if (started.error || !started.clientSecret || !started.publishableKey || !started.returnUrl) {
        setError(started.error ?? "Unable to start subscription payment method setup.");
        return;
      }
      setActiveKey(started.publishableKey);
      setReturnUrl(started.returnUrl);
      setClientSecret(started.clientSecret);
    });
  }

  function finishReturnedSetup() {
    if (!returnedSetupIntentId) return;
    startTransition(async () => {
      const saved = await finalizeSubscriptionPaymentMethodSetupAction(returnedSetupIntentId);
      if (saved.error) {
        setError(saved.error);
        return;
      }
      setNotice("Subscription payment method updated.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Subscription payment method</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This card pays the subscription invoice. It is not used for
          automatic SMS credits.
        </p>
      </div>
      {view.state === "no_subscription" ? (
        <p className="text-sm text-muted-foreground">
          Payment method will be added when paid billing begins.
        </p>
      ) : null}
      {view.state === "missing" ? (
        <p className="text-sm">No subscription payment method is currently available.</p>
      ) : null}
      {view.state === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          The subscription payment method could not be loaded.
        </p>
      ) : null}
      {view.state === "ready" && view.display ? <CardSummary display={view.display} /> : null}
      {view.state === "ready" && !view.display ? (
        <p className="text-sm">A subscription payment method is on file.</p>
      ) : null}
      {canManage && view.state !== "no_subscription" ? (
        <Button type="button" variant="outline" onClick={begin} disabled={pending}>
          {pending ? "Working…" : "Change payment method"}
        </Button>
      ) : null}
      {returnedSetupIntentId && canManage ? (
        <Button type="button" variant="outline" onClick={finishReturnedSetup} disabled={pending}>
          Confirm returned card setup
        </Button>
      ) : null}
      {clientSecret && returnUrl && stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <SetupForm
            returnUrl={returnUrl}
            onSaved={() => {
              setClientSecret(null);
              setNotice("Subscription payment method updated.");
              router.refresh();
            }}
          />
        </Elements>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
    </section>
  );
}

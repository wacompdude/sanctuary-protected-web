import Link from "next/link";
import { AlertTriangle, CreditCard } from "lucide-react";
import { Suspense } from "react";
import { BillingPlanPanel } from "@/components/billing/billing-plan-panel";
import { SmsPackagePurchaseButton } from "@/components/billing/sms-package-panel";
import { BillingAddressForm } from "@/components/billing/billing-address-form";
import { SmsPaymentSetupPanel } from "@/components/billing/sms-payment-setup-panel";
import { SubscriptionPaymentMethodPanel } from "@/components/billing/subscription-payment-method-panel";
import { readOrganizationBillingAddress } from "@/lib/billing/organization-billing-address";
import { formatSubscriptionInvoiceAmounts } from "@/lib/billing/stripe/subscription-tax";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  billingProviderStatusMessage,
  isBillingProviderReady,
  listBillingHistory,
  requireBillingViewAccess,
  smsPackageForPlan,
} from "@/lib/billing";
import { summarizeApplicationSmsCapacity } from "@/lib/billing/sms-capacity-summary";
import { smsPurchaseReturnMessage } from "@/lib/billing/stripe/checkout-urls";
import {
  isStripeSecretConfigured,
  readStripePublishableKey,
} from "@/lib/billing/stripe/config";
import { readSetupIntentIdFromClient } from "@/lib/billing/stripe/sms-payment-setup";
import { readSafeCardDisplay } from "@/lib/billing/stripe/sms-payment-setup-live";
import { readSubscriptionPaymentMethodView } from "@/lib/billing/stripe/subscription-payment-method-live";
import { subscriptionPaymentAttention } from "@/lib/billing/stripe/subscription-dunning";
import { shouldDisplayTrialEnd, subscriptionGrantsAccess } from "@/lib/subscriptions/status";
import { organizationHasProviderSubscription } from "@/lib/billing/checkout-eligibility";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { ChurchAccessError } from "@/lib/organization/errors";
import { formatChurchDateTime } from "@/lib/datetime/format";
import {
  getChurchSubscription,
  getLatestChurchSubscription,
  getSeatUsageMeter,
  getSmsSegmentUsageMeter,
  listSubscriptionPlans,
  usageWarningLevel,
} from "@/lib/subscriptions";
import type { UsageMeter, UsageWarningLevel } from "@/lib/subscriptions";

function warningLabel(level: UsageWarningLevel): string {
  switch (level) {
    case "warning":
      return "Approaching limit";
    case "critical":
      return "Near limit";
    case "exceeded":
      return "Limit reached";
    default:
      return "Within limit";
  }
}

function formatMeterValue(meter: UsageMeter, consumedOnly = false): string {
  const quantity = consumedOnly ? meter.quantityUsed : meter.quantityCommitted;
  if (meter.unlimited || meter.limit === null) {
    return `${quantity} used · Unlimited`;
  }
  return `${quantity} / ${meter.limit} used`;
}

function UsageMeterRow({
  label,
  meter,
  note,
  consumedOnly = false,
}: {
  label: string;
  meter: UsageMeter;
  note?: string;
  /** SMS reservations are not consumed until Bird accepts the message. */
  consumedOnly?: boolean;
}) {
  const warning = consumedOnly
    ? usageWarningLevel(meter.quantityUsed, meter.limit, meter.unlimited)
    : meter.warningLevel;
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="text-xs text-muted-foreground">{warningLabel(warning)}</dd>
      </div>
      <p className="mt-1 text-sm font-medium">
        {formatMeterValue(meter, consumedOnly)}
      </p>
      {meter.periodStart && meter.periodEnd ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Period {new Date(meter.periodStart).toLocaleDateString()} –{" "}
          {new Date(meter.periodEnd).toLocaleDateString()}
        </p>
      ) : null}
      {note ? (
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

async function BillingContent({
  smsPurchase,
  returnedSetupIntentId,
  subscriptionSetupIntentId,
}: {
  smsPurchase?: string;
  returnedSetupIntentId: string | null;
  subscriptionSetupIntentId: string | null;
}) {
  const { supabase, church, canManageBilling } = await requireBillingViewAccess();
  const { data } = await supabase
    .from("organizations")
    .select("plan_name, trial_ends_at, status")
    .eq("id", church.id)
    .maybeSingle();

  const [subscription, latestSubscription, seatMeter, smsMeter, plans, history] =
    await Promise.all([
      getChurchSubscription(church.id),
      getLatestChurchSubscription(church.id),
      getSeatUsageMeter(church.id),
      getSmsSegmentUsageMeter(church.id),
      listSubscriptionPlans(),
      listBillingHistory(church.id, 20),
    ]);
  const cancelledSubscription =
    !subscription && latestSubscription?.status === "cancelled"
      ? latestSubscription
      : null;
  const hasProviderSubscription = organizationHasProviderSubscription(
    subscription?.billing_subscription_id,
  );
  const subscriptionPaymentView = await readSubscriptionPaymentMethodView(church.id);
  const { data: recentInvoices } = await supabase
    .from("billing_invoices")
    .select("status, metadata")
    .eq("organization_id", church.id)
    .order("updated_at", { ascending: false })
    .limit(8);
  const latestFailure = (recentInvoices ?? []).find((row) => {
    const metadata = row.metadata;
    return Boolean(
      metadata &&
        typeof metadata === "object" &&
        !Array.isArray(metadata) &&
        (metadata as { failure?: unknown }).failure === true,
    );
  });
  const failureMetadata =
    latestFailure?.metadata &&
    typeof latestFailure.metadata === "object" &&
    !Array.isArray(latestFailure.metadata)
      ? (latestFailure.metadata as {
          recovered?: unknown;
          next_payment_attempt?: unknown;
        })
      : null;
  const paymentAttention = subscriptionPaymentAttention({
    invoiceStatus: latestFailure?.status ?? null,
    failure: Boolean(latestFailure),
    recovered: failureMetadata?.recovered === true,
    nextPaymentAttemptUnix:
      typeof failureMetadata?.next_payment_attempt === "number"
        ? failureMetadata.next_payment_attempt
        : null,
    timeZone: church.timezone,
    subscriptionStatus: subscription?.status ?? null,
  });

  const publicPlans = plans.filter(
    (plan) => plan.is_public && plan.status === "active",
  );
  const smsReturnMessage = smsPurchaseReturnMessage(smsPurchase);
  const grantingPlanKey =
    subscription && subscriptionGrantsAccess(subscription.status)
      ? String(subscription.plan_key)
      : null;
  const smsPackage = grantingPlanKey ? smsPackageForPlan(grantingPlanKey) : undefined;
  const { data: purchasedCredits } = await supabase
    .from("organization_sms_credit_balances")
    .select("balance, reserved")
    .eq("organization_id", church.id)
    .maybeSingle();
  const smsCapacity = summarizeApplicationSmsCapacity({
    includedLimit: smsMeter.limit,
    includedUsed: smsMeter.quantityUsed,
    includedReserved: smsMeter.quantityReserved,
    purchasedBalance: purchasedCredits?.balance ?? null,
    purchasedReserved: purchasedCredits?.reserved ?? null,
  });
  const { data: billingProfile } = await supabase
    .from("organization_billing_profiles")
    .select("billing_address")
    .eq("organization_id", church.id)
    .maybeSingle();
  const { data: invoiceRows } = await supabase
    .from("billing_invoices")
    .select("id, status, subtotal_cents, tax_cents, total_cents, created_at, metadata")
    .eq("organization_id", church.id)
    .order("created_at", { ascending: false })
    .limit(8);
  const billingAddress = readOrganizationBillingAddress(billingProfile?.billing_address);
  const { data: replenishment } = await supabase
    .from("organization_sms_auto_replenishment")
    .select("status, payment_method_id")
    .eq("organization_id", church.id)
    .maybeSingle();
  const replenishmentPaymentMethodId =
    typeof replenishment?.payment_method_id === "string"
      ? replenishment.payment_method_id
      : null;
  const publishableKey = readStripePublishableKey();
  const safePublishableKey =
    publishableKey.startsWith("pk_test_") || publishableKey.startsWith("pk_live_")
      ? publishableKey
      : null;
  let paymentMethodDisplay = null;
  if (replenishmentPaymentMethodId && isStripeSecretConfigured()) {
    try {
      paymentMethodDisplay = await readSafeCardDisplay(replenishmentPaymentMethodId);
    } catch {
      paymentMethodDisplay = null;
    }
  }

  return (
    <>
      {smsReturnMessage ? (
        <p className="rounded-md border border-border px-3 py-2 text-sm">
          {smsReturnMessage}
        </p>
      ) : null}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Plans, usage, and subscription controls for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>Current subscription</CardTitle>
          <CardDescription>
            Your current plan determines available features, user limits, and
            monthly application SMS allowances. Plan changes and billing are
            securely processed through Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Plan
              </dt>
              <dd className="mt-1 text-sm">
                {subscription?.plan_display_name ||
                  cancelledSubscription?.plan_display_name ||
                  data?.plan_name?.trim() ||
                  "Not configured"}
              </dd>
              <dd className="mt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/plans">View plan features</Link>
                </Button>
              </dd>
            </div>
            {shouldDisplayTrialEnd({
              subscriptionStatus: subscription?.status ?? null,
              organizationStatus: data?.status ?? church.status,
            }) ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Trial ends
              </dt>
              <dd className="mt-1 text-sm">
                {subscription?.trial_end || data?.trial_ends_at
                  ? formatChurchDateTime(
                      subscription?.trial_end || data?.trial_ends_at || "",
                      {
                        timeZone: church.timezone,
                      },
                    )
                  : "Not configured"}
              </dd>
            </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Subscription status
              </dt>
              <dd className="mt-1 text-sm capitalize">
                {subscription?.status ??
                  (cancelledSubscription ? "cancelled" : "no subscription")}
                {subscription?.cancel_at_period_end
                  ? " · cancels at period end"
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Account status
              </dt>
              <dd className="mt-1 text-sm capitalize">
                {data?.status ?? church.status}
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Usage this period</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              <UsageMeterRow
                label="Active seats"
                meter={seatMeter}
                note="Pending invitations do not count until accepted."
              />
              <UsageMeterRow
                label="Monthly SMS segments"
                meter={smsMeter}
                consumedOnly
                note="Application SMS usage is measured in carrier SMS segments. Long messages may use more than one segment per recipient. MFA/security texts do not use this allowance."
              />
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card id="subscription-payment-method">
        <CardHeader>
          <CardTitle>Subscription payment method</CardTitle>
          <CardDescription>
            The card Stripe uses for the next organization subscription invoice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentAttention.show ? (
            <div
              role="status"
              className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-foreground"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                aria-hidden
              />
              <div className="min-w-0 space-y-2">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  {paymentAttention.title}
                </p>
                <p>{paymentAttention.body}</p>
                {paymentAttention.retryLabel ? (
                  <p className="font-medium">{paymentAttention.retryLabel}</p>
                ) : null}
                {canManageBilling ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href="#subscription-payment-method">Change payment method</a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          <SubscriptionPaymentMethodPanel
            canManage={canManageBilling}
            view={subscriptionPaymentView}
            publishableKey={readStripePublishableKey()}
            returnedSetupIntentId={subscriptionSetupIntentId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing &amp; Tax Address</CardTitle>
          <CardDescription>
            This address is used for billing and to determine applicable taxes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingAddressForm canManage={canManageBilling} address={billingAddress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application SMS</CardTitle>
          <CardDescription>
            Application text messages use included monthly SMS first, then
            purchased SMS credits. MFA and security texts do not use this
            allowance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Included this month
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.includedLimit}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Used this month
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.includedUsed}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Remaining included
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.remainingIncluded}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Purchased balance
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.purchasedBalance}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Purchased reserved
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.purchasedReserved}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Purchased available
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.purchasedAvailable}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Total available
              </dt>
              <dd className="mt-1 text-sm">{smsCapacity.totalAvailable}</dd>
            </div>
          </dl>
          {smsPackage?.monthlySmsSegmentLimit === 0 ? (
            <p className="text-sm text-muted-foreground">
              Servant Standard does not include monthly application SMS credits.
              You can purchase SMS credit blocks whenever your organization
              needs to send application text messages.
            </p>
          ) : null}
          {smsPackage && canManageBilling ? (
            <SmsPackagePurchaseButton
              credits={smsPackage.smsPackageCredits}
              priceCents={smsPackage.smsPackagePriceCents}
              providerReady={isBillingProviderReady()}
              providerMessage={billingProviderStatusMessage()}
            />
          ) : null}
          {smsPackage && !canManageBilling ? (
            <p className="text-sm text-muted-foreground">
              Only an owner or co-owner can purchase SMS credits.
            </p>
          ) : null}
          {!smsPackage ? (
            <p className="text-sm text-muted-foreground">
              SMS credit purchases are available while the organization has an
              active subscription.
            </p>
          ) : null}
          <SmsPaymentSetupPanel
            canManage={canManageBilling}
            status={
              typeof replenishment?.status === "string" ? replenishment.status : null
            }
            hasPaymentMethod={Boolean(replenishmentPaymentMethodId)}
            display={paymentMethodDisplay}
            publishableKey={canManageBilling ? safePublishableKey : null}
            returnedSetupIntentId={canManageBilling ? returnedSetupIntentId : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Choose a plan to start billing, upgrade immediately, or review a
            future downgrade. Checkout is used for the first subscription.
            Existing paid subscriptions upgrade in place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingPlanPanel
            key={`${subscription ? String(subscription.plan_key) : cancelledSubscription ? "cancelled" : "none"}-${subscription?.schedule_status ?? "none"}-${subscription?.cancel_at_period_end ? "canceling" : "renewing"}`}
            plans={publicPlans}
            currentPlanKey={
              subscription ? String(subscription.plan_key) : null
            }
            hasProviderSubscription={hasProviderSubscription}
            providerReady={isBillingProviderReady()}
            providerMessage={billingProviderStatusMessage()}
            cancelAtPeriodEnd={Boolean(subscription?.cancel_at_period_end)}
            paidThroughIso={subscription?.current_period_end ?? null}
            currentPlanName={subscription?.plan_display_name ?? null}
            cancellationMode={
              hasProviderSubscription
                ? "paid"
                : cancelledSubscription
                  ? "cancelled"
                  : "trial"
            }
            canManageBilling={canManageBilling}
            scheduledDowngrade={
              subscription?.schedule_status === "scheduled" &&
              subscription.scheduled_plan_key &&
              subscription.scheduled_effective_at
                ? {
                    currentPlanName: subscription.plan_display_name,
                    targetPlanKey: String(subscription.scheduled_plan_key),
                    targetPlanName:
                      subscription.scheduled_plan_name ??
                      String(subscription.scheduled_plan_key),
                    effectiveAt: subscription.scheduled_effective_at,
                  }
                : null
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing history</CardTitle>
          <CardDescription>
            Subscription changes and provider webhook events for this church.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoiceRows && invoiceRows.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {invoiceRows.map((invoice) => {
                const metadata =
                  invoice.metadata &&
                  typeof invoice.metadata === "object" &&
                  !Array.isArray(invoice.metadata)
                    ? (invoice.metadata as Record<string, unknown>)
                    : {};
                const taxDetermined = metadata.tax_determined === true;
                return (
                  <li
                    key={invoice.id}
                    className="rounded-md border border-border px-3 py-2"
                  >
                    <p className="text-sm font-medium capitalize">{invoice.status}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSubscriptionInvoiceAmounts({
                        subtotalCents: invoice.subtotal_cents,
                        taxCents: invoice.tax_cents,
                        totalCents: invoice.total_cents,
                        taxDetermined,
                      })}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No billing or subscription history yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium capitalize">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatChurchDateTime(item.occurredAt, {
                        timeZone: church.timezone,
                      })}
                    </p>
                  </div>
                  {item.detail ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/settings/church/account">
                View church account card
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

async function BillingWrapper({
  searchParams,
}: {
  searchParams: Promise<{
    sms_purchase?: string;
    setup_intent?: string;
    subscription_pm?: string;
  }>;
}) {
  const params = await searchParams;
  const subscriptionReturn = params.subscription_pm === "1";
  const setupIntentId = readSetupIntentIdFromClient(params.setup_intent);
  try {
    return (
      <BillingContent
        smsPurchase={params.sms_purchase}
        returnedSetupIntentId={subscriptionReturn ? null : setupIntentId}
        subscriptionSetupIntentId={subscriptionReturn ? setupIntentId : null}
      />
    );
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load billing."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    sms_purchase?: string;
    setup_intent?: string;
    subscription_pm?: string;
  }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <BillingWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

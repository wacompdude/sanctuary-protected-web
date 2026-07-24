import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Suspense } from "react";
import { BillingPlanPanel } from "@/components/billing/billing-plan-panel";
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
} from "@/lib/billing";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { formatChurchDateTime } from "@/lib/datetime/format";
import {
  getChurchSubscription,
  getSeatUsageMeter,
  getSmsSegmentUsageMeter,
  listSubscriptionPlans,
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

function formatMeterValue(meter: UsageMeter): string {
  if (meter.unlimited || meter.limit === null) {
    return `${meter.quantityCommitted} used · Unlimited`;
  }
  return `${meter.quantityCommitted} / ${meter.limit} used`;
}

function UsageMeterRow({
  label,
  meter,
  note,
}: {
  label: string;
  meter: UsageMeter;
  note?: string;
}) {
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="text-xs text-muted-foreground">
          {warningLabel(meter.warningLevel)}
        </dd>
      </div>
      <p className="mt-1 text-sm font-medium">{formatMeterValue(meter)}</p>
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

async function BillingContent() {
  const { supabase, church } = await requireMinChurchRole("owner");
  const { data } = await supabase
    .from("churches")
    .select("plan_name, trial_ends_at, status")
    .eq("id", church.id)
    .maybeSingle();

  const [subscription, seatMeter, smsMeter, plans, history] = await Promise.all([
    getChurchSubscription(church.id),
    getSeatUsageMeter(church.id),
    getSmsSegmentUsageMeter(church.id),
    listSubscriptionPlans(),
    listBillingHistory(church.id, 20),
  ]);

  const publicPlans = plans.filter(
    (plan) => plan.is_public && plan.status === "active",
  );

  return (
    <>
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
            Entitlements are enforced by feature keys. Checkout stays disabled
            until a billing provider adapter is connected.
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
                  data?.plan_name?.trim() ||
                  "Not configured"}
              </dd>
            </div>
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
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Subscription status
              </dt>
              <dd className="mt-1 text-sm capitalize">
                {subscription?.status ?? "no subscription"}
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
                label="SMS segments"
                meter={smsMeter}
                note="Counted when SMS deliveries succeed."
              />
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>
            Compare plans, review downgrade impact, then checkout (when a
            provider is connected) or apply a manual plan change for now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingPlanPanel
            plans={publicPlans}
            currentPlanKey={
              subscription ? String(subscription.plan_key) : null
            }
            providerReady={isBillingProviderReady()}
            providerMessage={billingProviderStatusMessage()}
            cancelAtPeriodEnd={Boolean(subscription?.cancel_at_period_end)}
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

async function BillingWrapper() {
  try {
    return <BillingContent />;
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

export default function BillingPage() {
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
        <BillingWrapper />
      </Suspense>
    </div>
  );
}

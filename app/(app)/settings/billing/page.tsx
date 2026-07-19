import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { formatChurchDateTime } from "@/lib/datetime/format";

async function BillingContent() {
  const { supabase, church } = await requireMinChurchRole("owner");
  const { data } = await supabase
    .from("churches")
    .select("plan_name, trial_ends_at, status")
    .eq("id", church.id)
    .maybeSingle();

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Subscription placeholders for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
          </div>
          <CardTitle>Plan and invoices</CardTitle>
          <CardDescription>
            Billing providers, invoices, and plan changes are not connected yet.
            Values below are display placeholders only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Plan
              </dt>
              <dd className="mt-1 text-sm">
                {data?.plan_name?.trim() || "Not configured"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Trial ends
              </dt>
              <dd className="mt-1 text-sm">
                {data?.trial_ends_at
                  ? formatChurchDateTime(data.trial_ends_at, {
                      timeZone: church.timezone,
                    })
                  : "Not configured"}
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
          <Button asChild variant="outline">
            <Link href="/settings/church/account">View church account card</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
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

async function BillingWrapper() {
  try {
    return <BillingContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    const message =
      error instanceof ChurchAccessError
        ? error.message
        : "Unable to load billing settings.";
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

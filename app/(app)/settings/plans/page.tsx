import Link from "next/link";
import { Suspense } from "react";
import { PlanComparisonTable } from "@/components/subscriptions/plan-comparison-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/organization/auth";
import { hasMinRole } from "@/lib/organization/navigation";
import { getPlanComparison } from "@/lib/subscriptions/catalog";
import { getChurchSubscription } from "@/lib/subscriptions/queries";

async function PlansContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const [subscription, comparison] = await Promise.all([
    getChurchSubscription(church.id),
    getPlanComparison(),
  ]);
  const canManageBilling = hasMinRole(membership.role, "owner");

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscription</h1>
        <p className="mt-1 text-muted-foreground">
          Current plan and features for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            Feature access is controlled by the subscription catalog, not by
            hard-coded plan names in the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-lg font-semibold">
            {subscription?.plan_display_name ?? "Not configured"}
          </p>
          {canManageBilling ? (
            <Button asChild variant="outline">
              <Link href="/settings/billing">Manage billing</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact a church owner if you need to change plans.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan features</CardTitle>
          <CardDescription>
            Included features and higher-tier options from the live catalog.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comparison.plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Subscription plans are not available yet.
            </p>
          ) : (
            <PlanComparisonTable
              plans={comparison.plans}
              rows={comparison.rows}
              currentPlanKey={
                subscription ? String(subscription.plan_key) : null
              }
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function SettingsPlansPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading plans…
            </CardContent>
          </Card>
        }
      >
        <PlansWrapper />
      </Suspense>
    </div>
  );
}

async function PlansWrapper() {
  try {
    return <PlansContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof ChurchAccessError || error instanceof Error
              ? error.message
              : "Unable to load subscription plans."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

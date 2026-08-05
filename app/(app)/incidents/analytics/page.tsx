import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, BarChart3 } from "lucide-react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  listIncidentsForChurch,
} from "@/lib/incidents/queries";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { buildIncidentAnalytics } from "@/lib/incidents/analytics";
import { resolveIncidentListSort } from "@/lib/incidents/format";
import { parseAppPreferences } from "@/lib/organization/settings";
import {
  IncidentAnalyticsDetailTable,
  IncidentBreakdownChart,
} from "@/components/incidents/incident-analytics-charts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  campusFilterLabel,
  campusFilterOrClause,
  resolveCampusFilter,
} from "@/lib/campuses/filter";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { hasFeature } from "@/lib/subscriptions/resolver";

function AnalyticsPageHeader({
  subtitle,
  showListLink = true,
}: {
  subtitle: string;
  showListLink?: boolean;
}) {
  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4 -ml-2 h-11 px-3" asChild>
        <Link href="/incidents?view=all">
          <ArrowLeft className="h-4 w-4" />
          Back to all incidents
        </Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <BarChart3 className="h-8 w-8 text-muted-foreground" aria-hidden />
            Incident analytics
          </h1>
          <p className="mt-1 text-muted-foreground">{subtitle}</p>
        </div>
        {showListLink ? (
          <Button asChild variant="outline" className="h-11">
            <Link href="/incidents?view=all">View incident list</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

async function IncidentAnalyticsContent() {
  const { church, membership, user, supabase } =
    await getAuthenticatedUserWithChurch();
  const access = await hasFeature({
    organizationId: church.id,
    featureKey: FEATURE_KEYS.INCIDENT_ANALYTICS,
  });

  if (!access.allowed) {
    return (
      <>
        <AnalyticsPageHeader
          subtitle={`Analytics for ${church.name}.`}
          showListLink={false}
        />
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Upgrade required</CardTitle>
            <CardDescription>
              {access.reason ??
                "Incident analytics is not included in your current plan. Upgrade to unlock it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            This module is controlled by your subscription entitlements.
          </CardContent>
        </Card>
      </>
    );
  }

  const { data: settingsRow } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", church.id)
    .maybeSingle();
  const preferences = parseAppPreferences(settingsRow?.settings);
  const sort = resolveIncidentListSort(preferences);
  const campusFilter = await resolveCampusFilter({
    organizationId: church.id,
    userId: user.id,
    role: membership.role,
  });
  const incidents = await listIncidentsForChurch(church.id, sort, {
    campusFilterOr: campusFilterOrClause(campusFilter),
  });
  const analytics = buildIncidentAnalytics(incidents);
  const filterLabel = campusFilterLabel(campusFilter);

  return (
    <>
      <AnalyticsPageHeader
        subtitle={`Breakdown of all incidents for ${church.name} · ${filterLabel}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total incidents</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {analytics.total}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            All reported incidents in scope.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open / investigating</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {analytics.openActive}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Not yet resolved or closed.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Charts</CardTitle>
          <CardDescription>
            Graphical breakdown by type, severity, and status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-10">
          {analytics.total === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No incidents have been reported yet.{" "}
              <Link
                href="/incidents/new"
                className="font-medium underline underline-offset-4"
              >
                Report the first incident
              </Link>
            </p>
          ) : (
            <>
              <IncidentBreakdownChart
                title="By type"
                description="Distribution of incident categories."
                buckets={analytics.byType}
                total={analytics.total}
              />
              <IncidentBreakdownChart
                title="By severity"
                description="How serious reported incidents were."
                buckets={analytics.bySeverity}
                total={analytics.total}
              />
              <IncidentBreakdownChart
                title="By status"
                description="Current workflow state across incidents."
                buckets={analytics.byStatus}
                total={analytics.total}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report details</CardTitle>
          <CardDescription>
            Tabular counts and share for each breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-3">
          <IncidentAnalyticsDetailTable
            title="Type"
            buckets={analytics.byType}
            total={analytics.total}
          />
          <IncidentAnalyticsDetailTable
            title="Severity"
            buckets={analytics.bySeverity}
            total={analytics.total}
          />
          <IncidentAnalyticsDetailTable
            title="Status"
            buckets={analytics.byStatus}
            total={analytics.total}
          />
        </CardContent>
      </Card>
    </>
  );
}

function IncidentAnalyticsFallback() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Incident analytics</h1>
        <p className="mt-1 text-muted-foreground">Loading analytics…</p>
      </div>
      <Card>
        <CardContent className="py-12 text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    </>
  );
}

async function IncidentAnalyticsWrapper() {
  try {
    return <IncidentAnalyticsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : "Unable to load incident analytics.";

    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Incident analytics</h1>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
}

export default function IncidentAnalyticsPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<IncidentAnalyticsFallback />}>
        <IncidentAnalyticsWrapper />
      </Suspense>
    </div>
  );
}

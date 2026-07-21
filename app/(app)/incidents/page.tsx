import Link from "next/link";
import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  listIncidentsForChurch,
} from "@/lib/incidents/queries";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  formatDateTime,
  formatIncidentId,
  labelForEnum,
  resolveIncidentListSort,
} from "@/lib/incidents/format";
import { INCIDENT_TYPES } from "@/lib/incidents/constants";
import { parseAppPreferences } from "@/lib/church/settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  IncidentSeverityText,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import { Plus } from "lucide-react";
import {
  campusFilterLabel,
  campusFilterOrClause,
  resolveCampusFilter,
} from "@/lib/campuses/filter";

const CLOSED_STATUSES = new Set(["closed", "resolved"]);

async function IncidentsList({ showAll }: { showAll: boolean }) {
  const { church, membership, user, supabase } =
    await getAuthenticatedUserWithChurch();
  const { data: settingsRow } = await supabase
    .from("churches")
    .select("settings")
    .eq("id", church.id)
    .maybeSingle();
  const preferences = parseAppPreferences(settingsRow?.settings);
  const sort = resolveIncidentListSort(preferences);
  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });
  const campusOr = campusFilterOrClause(campusFilter);
  let incidents;

  try {
    incidents = await listIncidentsForChurch(church.id, sort, {
      campusFilterOr: campusOr,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load incidents.";
    const hint =
      message.includes("occurred_at") || message.includes("incidents")
        ? " Run supabase/migrations/005_fix_incidents_schema.sql in the Supabase SQL Editor."
        : "";

    return (
      <>
        <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
        <Card className="mt-8">
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              {message}
              {hint}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const visibleIncidents = showAll
    ? incidents
    : incidents.filter((incident) => !CLOSED_STATUSES.has(incident.status));

  const filterLabel = campusFilterLabel(campusFilter);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-1 text-muted-foreground">
            {showAll
              ? `All incidents for ${church.name}`
              : `Open incidents for ${church.name}`}
            {" · "}
            {filterLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showAll ? (
            <Button asChild variant="outline" className="h-11">
              <Link href="/incidents">Active incidents</Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className="h-11">
              <Link href="/incidents?view=all">View all incidents</Link>
            </Button>
          )}
          <Button asChild className="h-11">
            <Link href="/incidents/new">
              <Plus className="h-4 w-4" />
              New Incident
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{showAll ? "All incidents" : "Active incidents"}</CardTitle>
          <CardDescription>
            {visibleIncidents.length} incident
            {visibleIncidents.length === 1 ? "" : "s"}
            {showAll
              ? " on record"
              : " open or investigating"}
            {!showAll && incidents.length > visibleIncidents.length
              ? ` · ${incidents.length - visibleIncidents.length} closed or resolved hidden`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visibleIncidents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>
                {showAll
                  ? "No incidents have been reported yet."
                  : "No open or investigating incidents."}
              </p>
              {!showAll && incidents.length > 0 ? (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/incidents?view=all">View all incidents</Link>
                </Button>
              ) : (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/incidents/new">Report the first incident</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      ID
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Title
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Location
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Severity
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Occurred
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleIncidents.map((incident) => (
                    <tr
                      key={incident.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4 font-mono text-xs">
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="hover:underline"
                        >
                          {formatIncidentId(incident.id)}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          href={`/incidents/${incident.id}`}
                          className="hover:underline"
                        >
                          {incident.title}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {labelForEnum(INCIDENT_TYPES, incident.type)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {incident.location}
                      </td>
                      <td className="py-3 pr-4">
                        <IncidentSeverityText severity={incident.severity} />
                      </td>
                      <td className="py-3 pr-4">
                        <IncidentStatusBadge status={incident.status} />
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatDateTime(
                          incident.occurred_at,
                          preferences,
                          church.timezone,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function IncidentsListFallback() {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-1 text-muted-foreground">Loading incidents…</p>
        </div>
      </div>
      <Card>
        <CardContent className="py-12 text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    </>
  );
}

function IncidentsError({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

async function IncidentsListWrapper({ showAll }: { showAll: boolean }) {
  try {
    return <IncidentsList showAll={showAll} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : "Unable to load incidents.";

    return (
      <>
        <IncidentsError message={message} />
        {error instanceof ChurchAccessError && (
          <p className="mt-2 text-sm text-muted-foreground">
            Run <code>supabase/migrations/004_fix_churches_access.sql</code> in
            the Supabase SQL Editor, then reload this page.
          </p>
        )}
      </>
    );
  }
}

async function IncidentsPageLoader({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const showAll = params.view === "all";
  return <IncidentsListWrapper showAll={showAll} />;
}

export default function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<IncidentsListFallback />}>
        <IncidentsPageLoader searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

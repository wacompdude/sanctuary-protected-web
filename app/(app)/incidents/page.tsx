import Link from "next/link";
import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  listIncidentsForChurch,
} from "@/lib/incidents/queries";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { formatDateTime, formatIncidentId, labelForEnum } from "@/lib/incidents/format";
import { INCIDENT_TYPES } from "@/lib/incidents/constants";
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

async function IncidentsList() {
  const { church } = await getAuthenticatedUserWithChurch();
  let incidents;

  try {
    incidents = await listIncidentsForChurch(church.id);
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

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incidents</h1>
          <p className="mt-1 text-muted-foreground">
            Incidents for {church.name}.
          </p>
        </div>
        <Button asChild>
          <Link href="/incidents/new">
            <Plus className="h-4 w-4" />
            New Incident
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Incidents</CardTitle>
          <CardDescription>
            {incidents.length} incident{incidents.length === 1 ? "" : "s"} on
            record
          </CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>No incidents have been reported yet.</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/incidents/new">Report the first incident</Link>
              </Button>
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
                  {incidents.map((incident) => (
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
                        {formatDateTime(incident.occurred_at)}
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

export default function IncidentsPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<IncidentsListFallback />}>
        <IncidentsListWrapper />
      </Suspense>
    </div>
  );
}

async function IncidentsListWrapper() {
  try {
    return <IncidentsList />;
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

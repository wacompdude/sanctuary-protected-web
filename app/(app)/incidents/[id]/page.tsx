import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getIncidentWithUpdates,
} from "@/lib/incidents/queries";
import {
  formatDateTime,
  formatIncidentId,
  labelForEnum,
} from "@/lib/incidents/format";
import { INCIDENT_STATUSES, INCIDENT_TYPES } from "@/lib/incidents/constants";
import { IncidentUpdateForm } from "@/components/incidents/incident-update-form";
import { IncidentTimeline } from "@/components/incidents/incident-timeline";
import {
  IncidentSeverityText,
  IncidentStatusBadge,
} from "@/components/incidents/incident-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

async function IncidentDetailContent({
  id,
  created,
}: {
  id: string;
  created?: string;
}) {
  const { church } = await getAuthenticatedUserWithChurch();
  const incident = await getIncidentWithUpdates(id);

  if (!incident || incident.church_id !== church.id) {
    notFound();
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/incidents">
            <ArrowLeft className="h-4 w-4" />
            Back to Incidents
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {formatIncidentId(incident.id)}
            </p>
            <h1 className="text-3xl font-bold tracking-tight">{incident.title}</h1>
            <p className="mt-1 text-muted-foreground">{church.name}</p>
          </div>
          <IncidentStatusBadge status={incident.status} />
        </div>

        {created === "1" && (
          <p className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Incident created successfully.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Incident information and context.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Type
            </p>
            <p className="text-sm">
              {labelForEnum(INCIDENT_TYPES, incident.type)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Severity
            </p>
            <p className="text-sm">
              <IncidentSeverityText severity={incident.severity} />
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Status
            </p>
            <p className="text-sm">
              {labelForEnum(INCIDENT_STATUSES, incident.status)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Location
            </p>
            <p className="text-sm">{incident.location}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Occurred
            </p>
            <p className="text-sm">{formatDateTime(incident.occurred_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Reported
            </p>
            <p className="text-sm">{formatDateTime(incident.created_at)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Description
            </p>
            <p className="text-sm text-muted-foreground">
              {incident.description || "No description provided."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        <IncidentTimeline updates={incident.updates} />
        <IncidentUpdateForm
          incidentId={incident.id}
          currentStatus={incident.status}
        />
      </div>
    </>
  );
}

function IncidentDetailFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading incident…
      </CardContent>
    </Card>
  );
}

async function IncidentDetailWrapper({
  id,
  created,
}: {
  id: string;
  created?: string;
}) {
  try {
    return <IncidentDetailContent id={id} created={created} />;
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      );
    }

    throw error;
  }
}

async function IncidentDetailLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  return <IncidentDetailWrapper id={id} created={created} />;
}

export default function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<IncidentDetailFallback />}>
        <IncidentDetailLoader params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

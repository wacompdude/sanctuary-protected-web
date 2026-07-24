import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getIncidentWithUpdates,
  listActiveIncidentTeamMembers,
  listIncidentInvolvedMembers,
} from "@/lib/incidents/queries";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  formatDateTime,
  formatIncidentId,
  labelForEnum,
} from "@/lib/incidents/format";
import { INCIDENT_STATUSES, INCIDENT_TYPES } from "@/lib/incidents/constants";
import { IncidentUpdateForm } from "@/components/incidents/incident-update-form";
import { IncidentTimeline } from "@/components/incidents/incident-timeline";
import { ResendIncidentNotificationButton } from "@/components/incidents/resend-incident-notification-button";
import { IncidentPhotosCard } from "@/components/incidents/incident-photos";
import { IncidentTeamMembersCard } from "@/components/incidents/incident-team-members-card";
import { IncidentMedicalSuppliesCard } from "@/components/medical-supplies/incident-medical-supplies";
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
import { hasMinRole } from "@/lib/church/navigation";
import { canCreateOperationalNotifications } from "@/lib/notifications/permissions";
import {
  canManageMedicalSupplies,
  canRecordMedicalSupplyUsage,
} from "@/lib/medical-supplies/types";
import {
  listAvailableSuppliesForIncident,
  listUsageForIncident,
} from "@/lib/medical-supplies/queries";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { getIncidentPhotoEntitlements } from "@/lib/subscriptions/enforcement";
import { hasFeature } from "@/lib/subscriptions/resolver";
import { ArrowLeft } from "lucide-react";

async function IncidentDetailContent({
  id,
  created,
  photoError,
  memberError,
}: {
  id: string;
  created?: string;
  photoError?: string;
  memberError?: string;
}) {
  const { church, user, membership } = await getAuthenticatedUserWithChurch();
  const incident = await getIncidentWithUpdates(id);

  if (!incident || incident.church_id !== church.id) {
    notFound();
  }

  const canUpload = membership.role !== "viewer";
  const canManageAll = hasMinRole(membership.role, "security_leader");
  const canResendAlert = canCreateOperationalNotifications(membership.role);
  const isMedical = incident.type === "medical";
  const canManageSupplies = canManageMedicalSupplies(membership.role);

  const [
    involvedMembers,
    availableTeamMembers,
    supplyUsages,
    availableSupplies,
    photoEntitlements,
    medicalUsage,
  ] = await Promise.all([
    listIncidentInvolvedMembers(church.id, incident.id),
    listActiveIncidentTeamMembers(church.id).catch(() => []),
    isMedical ? listUsageForIncident(church.id, incident.id) : Promise.resolve([]),
    isMedical
      ? listAvailableSuppliesForIncident(church.id)
      : Promise.resolve([]),
    getIncidentPhotoEntitlements(church.id),
    hasFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.MEDICAL_INCIDENT_USAGE,
    }),
  ]);

  const canRecordSupplies =
    canRecordMedicalSupplyUsage(membership.role) && medicalUsage.allowed;

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
          <div className="flex flex-wrap items-center gap-3">
            {canResendAlert ? (
              <ResendIncidentNotificationButton
                incidentId={incident.id}
                severity={incident.severity}
              />
            ) : null}
            <IncidentStatusBadge status={incident.status} />
          </div>
        </div>

        {created === "1" && (
          <p className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            Incident created successfully.
          </p>
        )}
        {photoError && (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            Photos could not be uploaded: {photoError}. You can add them below.
          </p>
        )}
        {memberError && (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            Involved team members could not be saved: {memberError}. You can add
            them below.
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
            <p className="text-sm">
              {formatDateTime(incident.occurred_at, null, church.timezone)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Reported
            </p>
            <p className="text-sm">
              {formatDateTime(incident.created_at, null, church.timezone)}
            </p>
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

      <IncidentPhotosCard
        incidentId={incident.id}
        attachments={incident.attachments ?? []}
        canUpload={canUpload}
        currentUserId={user.id}
        canManageAll={canManageAll}
        maxCount={photoEntitlements.maxCount}
        maxBytes={photoEntitlements.maxBytes}
      />

      <IncidentTeamMembersCard
        incidentId={incident.id}
        members={involvedMembers}
        availableMembers={availableTeamMembers}
        canManage={canUpload}
      />

      {isMedical && (
        <IncidentMedicalSuppliesCard
          incidentId={incident.id}
          usages={supplyUsages}
          supplies={availableSupplies}
          canRecord={canRecordSupplies}
          canManage={canManageSupplies}
          timeZone={church.timezone}
        />
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <IncidentTimeline
          updates={incident.updates}
          timeZone={church.timezone}
        />
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
  photoError,
  memberError,
}: {
  id: string;
  created?: string;
  photoError?: string;
  memberError?: string;
}) {
  try {
    return (
      <IncidentDetailContent
        id={id}
        created={created}
        photoError={photoError}
        memberError={memberError}
      />
    );
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

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
  searchParams: Promise<{
    created?: string;
    photo_error?: string;
    member_error?: string;
  }>;
}) {
  const { id } = await params;
  const { created, photo_error: photoError, member_error: memberError } =
    await searchParams;
  return (
    <IncidentDetailWrapper
      id={id}
      created={created}
      photoError={photoError}
      memberError={memberError}
    />
  );
}

export default function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    created?: string;
    photo_error?: string;
    member_error?: string;
  }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<IncidentDetailFallback />}>
        <IncidentDetailLoader params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

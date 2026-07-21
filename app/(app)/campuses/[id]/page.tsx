import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CampusMembersPanel } from "@/components/campuses/campus-members-panel";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  labelForCampusStatus,
  labelForCampusType,
} from "@/lib/campuses/constants";
import {
  canActorManageCampusMemberships,
  listCampusMembers,
} from "@/lib/campuses/membership-queries";
import {
  canManageCampuses,
  canViewCampuses,
  hasImplicitAllCampusAccess,
} from "@/lib/campuses/permissions";
import { formatAddress, getCampus } from "@/lib/campuses/queries";
import { formatChurchDateTime } from "@/lib/datetime/format";

async function CampusDetailContent({ id }: { id: string }) {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();

  if (!canViewCampuses(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to view this campus.
        </CardContent>
      </Card>
    );
  }

  const { campus, extendedSchema } = await getCampus(church.id, id);
  if (!campus) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Campus not found.
        </CardContent>
      </Card>
    );
  }

  const canManageCampus = canManageCampuses(membership.role);
  const address = formatAddress(campus);

  const [canManageMembers, campusMembers, team] = extendedSchema
    ? await Promise.all([
        canActorManageCampusMemberships({
          churchId: church.id,
          campusId: campus.id,
          userId: user.id,
          churchRole: membership.role,
        }),
        listCampusMembers(church.id, campus.id),
        listChurchTeamMemberships(church.id).catch(() => []),
      ])
    : [false, [], [] as Awaited<ReturnType<typeof listChurchTeamMemberships>>];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{campus.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {extendedSchema ? `${labelForCampusType(campus.campus_type)} · ` : ""}
            {labelForCampusStatus(campus.status)}
            {campus.is_primary ? " · Primary" : ""}
            {campus.short_name ? ` · ${campus.short_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/campuses">Back to campuses</Link>
          </Button>
          {canManageCampus ? (
            <>
              <Button asChild variant="outline" className="h-11">
                <Link href={`/campuses/${campus.id}/settings`}>Settings</Link>
              </Button>
              <Button asChild className="h-11">
                <Link href={`/campuses/${campus.id}/edit`}>Edit</Link>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            {campus.description || "No description provided."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
          <p>
            <span className="font-medium text-foreground">Address: </span>
            {address || "—"}
          </p>
          <p>
            <span className="font-medium text-foreground">Timezone: </span>
            {campus.timezone || church.timezone || "—"}
          </p>
          {extendedSchema ? (
            <>
              <p>
                <span className="font-medium text-foreground">Email: </span>
                {campus.primary_email || "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Phone: </span>
                {campus.phone || "—"}
              </p>
              <p>
                <span className="font-medium text-foreground">Slug: </span>
                {campus.slug || "—"}
              </p>
            </>
          ) : null}
          <p>
            <span className="font-medium text-foreground">Updated: </span>
            {formatChurchDateTime(campus.updated_at, {
              timeZone: church.timezone,
            })}
          </p>
        </CardContent>
      </Card>

      {extendedSchema ? (
        <Card>
          <CardHeader>
            <CardTitle>Emergency information</CardTitle>
            <CardDescription>
              Local contacts for responders at this campus.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <p>
              <span className="font-medium text-foreground">Contact: </span>
              {campus.emergency_contact_name || "—"}
              {campus.emergency_contact_phone
                ? ` · ${campus.emergency_contact_phone}`
                : ""}
            </p>
            <p>
              <span className="font-medium text-foreground">Police: </span>
              {campus.police_non_emergency_phone || "—"}
            </p>
            <p>
              <span className="font-medium text-foreground">Fire: </span>
              {campus.fire_non_emergency_phone || "—"}
            </p>
            <p>
              <span className="font-medium text-foreground">Hospital: </span>
              {campus.nearest_hospital_name || "—"}
              {campus.nearest_hospital_phone
                ? ` · ${campus.nearest_hospital_phone}`
                : ""}
            </p>
            {campus.nearest_hospital_address ? (
              <p className="sm:col-span-2">
                <span className="font-medium text-foreground">
                  Hospital address:{" "}
                </span>
                {campus.nearest_hospital_address}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {extendedSchema ? (
        <CampusMembersPanel
          campusId={campus.id}
          members={campusMembers}
          candidateMembers={team
            .filter((row) => row.status === "active")
            .map((row) => ({
              membershipId: row.membershipId,
              name: row.name,
              role: row.role,
            }))}
          canManage={canManageMembers}
          hasImplicitAccessNote={hasImplicitAllCampusAccess(membership.role)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Apply migration 036 to enable campus memberships.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

export default function CampusDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading campus…
          </CardContent>
        </Card>
      }
    >
      <CampusDetailLoader params={params} />
    </Suspense>
  );
}

async function CampusDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    return <CampusDetailContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load campus."}
        </CardContent>
      </Card>
    );
  }
}

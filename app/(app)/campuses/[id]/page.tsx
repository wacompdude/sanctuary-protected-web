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
import { CampusDelegatedManagersPanel } from "@/components/campuses/campus-delegated-managers-panel";
import { CampusTabNav, type CampusTabId } from "@/components/campuses/campus-tab-nav";
import { CampusSettingsPanel } from "@/components/campuses/campus-settings-panel";
import { CampusArchiveCard } from "@/components/campuses/campus-archive-card";
import { CampusAuditPanel } from "@/components/campuses/campus-audit-panel";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { listChurchTeamMemberships } from "@/lib/organization/team-queries";
import {
  labelForCampusRole,
  labelForCampusStatus,
  labelForCampusType,
} from "@/lib/campuses/constants";
import { listCampusMembers } from "@/lib/campuses/membership-queries";
import { hasImplicitAllCampusAccess } from "@/lib/campuses/permissions";
import { loadCampusCapabilities } from "@/lib/campuses/server-auth";
import { formatAddress, getCampus } from "@/lib/campuses/queries";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { listDelegatedCampusManagers } from "@/lib/campuses/delegation";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

function parseTab(value: string | undefined): CampusTabId {
  if (
    value === "members" ||
    value === "teams" ||
    value === "roles" ||
    value === "delegated" ||
    value === "settings" ||
    value === "audit"
  ) {
    return value;
  }
  return "overview";
}

async function CampusDetailContent({
  id,
  tab,
}: {
  id: string;
  tab: CampusTabId;
}) {
  const { church, membership, capabilities } = await loadCampusCapabilities({
    campusId: id,
  });

  if (!capabilities.canView && !capabilities.canViewOverview && !capabilities.canViewMembers) {
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

  const address = formatAddress(campus);
  const tabs: Array<{ id: CampusTabId; label: string }> = [
    { id: "overview", label: "Overview" },
  ];
  if (extendedSchema && capabilities.canViewMembers) {
    tabs.push({ id: "members", label: "Members" });
    tabs.push({ id: "teams", label: "Security teams" });
    tabs.push({ id: "roles", label: "Roles & groups" });
  }
  if (capabilities.canManageSecurity) {
    tabs.push({ id: "delegated", label: "Delegated managers" });
  }
  if (capabilities.canManageSettings || capabilities.canEdit) {
    tabs.push({ id: "settings", label: "Settings" });
  }
  if (capabilities.canViewAudit) {
    tabs.push({ id: "audit", label: "Audit history" });
  }

  const activeTab = tabs.some((item) => item.id === tab) ? tab : "overview";

  const [campusMembers, team, delegated] = extendedSchema
    ? await Promise.all([
        capabilities.canViewMembers || activeTab === "members" || activeTab === "teams" || activeTab === "roles"
          ? listCampusMembers(church.id, campus.id)
          : Promise.resolve([]),
        capabilities.canAddMembers || capabilities.canManageSecurity
          ? listChurchTeamMemberships(church.id).catch(() => [])
          : Promise.resolve([]),
        capabilities.canManageSecurity && isServiceRoleConfigured()
          ? listDelegatedCampusManagers({
              admin: createAdminClient(),
              organizationId: church.id,
              campusId: campus.id,
              campusName: campus.name,
            }).catch(() => [])
          : Promise.resolve([]),
      ])
    : [[], [], []];

  const securityTeam = campusMembers.filter(
    (member) =>
      member.campus_role === "campus_security_leader" ||
      member.campus_role === "campus_security_member",
  );

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
          {capabilities.canEdit ? (
            <Button asChild className="h-11">
              <Link href={`/campuses/${campus.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <CampusTabNav campusId={campus.id} active={activeTab} tabs={tabs} />

      {activeTab === "overview" ? (
        <>
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
              <p>
                <span className="font-medium text-foreground">Members: </span>
                {campus.member_count ?? campusMembers.length}
              </p>
              <p>
                <span className="font-medium text-foreground">Security team: </span>
                {securityTeam.length}
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
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {activeTab === "members" && extendedSchema ? (
        <CampusMembersPanel
          campusId={campus.id}
          campusName={campus.name}
          members={campusMembers}
          candidateMembers={team
            .filter((row) => row.status === "active")
            .map((row) => ({
              membershipId: row.membershipId,
              name: row.name,
              role: row.role,
            }))}
          canManage={capabilities.canManageMembers}
          canAdd={capabilities.canAddMembers}
          canRemove={capabilities.canRemoveMembers}
          canAssignRoles={capabilities.canAssignRoles}
          assignableCampusRoles={capabilities.assignableCampusRoles}
          isTopLevelAdmin={capabilities.isTopLevelAdmin}
          hasImplicitAccessNote={hasImplicitAllCampusAccess(membership.role)}
        />
      ) : null}

      {activeTab === "teams" && extendedSchema ? (
        <Card>
          <CardHeader>
            <CardTitle>Security teams</CardTitle>
            <CardDescription>
              Campus security leader and security member assignments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {securityTeam.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No campus security team assignments yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {securityTeam.map((member) => (
                  <li key={member.id} className="px-3 py-3 text-sm">
                    <p className="font-medium">{member.display_name ?? "Member"}</p>
                    <p className="text-xs text-muted-foreground">
                      {labelForCampusRole(member.campus_role)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "roles" && extendedSchema ? (
        <Card>
          <CardHeader>
            <CardTitle>Roles & groups</CardTitle>
            <CardDescription>
              Campus-level assignments for this location. Organization Owner,
              Co-owner, and Administrator roles are assigned in Settings → Security.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {campusMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No campus role assignments yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {campusMembers.map((member) => (
                  <li key={member.id} className="px-3 py-3 text-sm">
                    <p className="font-medium">{member.display_name ?? "Member"}</p>
                    <p className="text-xs text-muted-foreground">
                      {labelForCampusRole(member.campus_role)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "delegated" && capabilities.canManageSecurity ? (
        <CampusDelegatedManagersPanel
          campusId={campus.id}
          campusName={campus.name}
          managers={delegated}
          candidates={team
            .filter((row) => row.status === "active")
            .map((row) => ({
              userId: row.userId,
              name: row.name,
              role: row.role,
            }))}
        />
      ) : null}

      {activeTab === "settings" && (capabilities.canManageSettings || capabilities.canEdit) ? (
        <div className="space-y-6">
          <CampusSettingsPanel
            campus={campus}
            canManage={capabilities.canManageSettings || capabilities.canEdit}
            extendedSchema={extendedSchema}
          />
          {capabilities.canDelete ? (
            <CampusArchiveCard
              campusId={campus.id}
              campusName={campus.name}
              isPrimary={campus.is_primary}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "audit" && capabilities.canViewAudit ? (
        <CampusAuditPanel
          organizationId={church.id}
          campusId={campus.id}
          timezone={church.timezone}
        />
      ) : null}
    </div>
  );
}

export default function CampusDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
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
      <CampusDetailLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CampusDetailLoader({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  try {
    const { id } = await params;
    const query = await searchParams;
    return <CampusDetailContent id={id} tab={parseTab(query.tab)} />;
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

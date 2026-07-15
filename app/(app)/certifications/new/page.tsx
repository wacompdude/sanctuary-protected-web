import { Suspense } from "react";
import Link from "next/link";
import { NewCertificationForm } from "@/components/certifications/new-certification-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { labelForMembershipRole } from "@/lib/church/invitations";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  ensureTeamMemberForChurchMember,
  listTeamMembersForChurch,
} from "@/lib/certifications/queries";
import { ArrowLeft } from "lucide-react";

async function NewCertificationContent({
  membershipId,
  teamMemberId,
}: {
  membershipId?: string;
  teamMemberId?: string;
}) {
  const { user, canManageCertifications, church } =
    await getAuthenticatedUserWithChurch();

  if (!canManageCertifications) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only administrators and security leaders can add certifications.
        </CardContent>
      </Card>
    );
  }

  let teamMembers = await listTeamMembersForChurch(church.id);
  let defaultTeamMemberId: string | undefined;
  let preselectedName: string | undefined;
  let ensureError: string | null = null;
  const fromTeam = Boolean(membershipId);

  if (membershipId) {
    try {
      const churchMembers = await listChurchTeamMemberships(church.id);
      const member = churchMembers.find(
        (row) => row.membershipId === membershipId,
      );

      if (!member) {
        ensureError = "Selected church member was not found.";
      } else {
        const contact = await ensureTeamMemberForChurchMember({
          churchId: church.id,
          createdBy: user.id,
          fullName: member.name,
          email: member.email,
          title: labelForMembershipRole(member.role),
        });
        defaultTeamMemberId = contact.id;
        preselectedName = contact.full_name;
        if (!teamMembers.some((row) => row.id === contact.id)) {
          teamMembers = [...teamMembers, contact].sort((a, b) =>
            a.full_name.localeCompare(b.full_name),
          );
        }
      }
    } catch (error) {
      ensureError =
        error instanceof Error
          ? error.message
          : "Unable to prepare certification contact for this member.";
    }
  } else if (teamMemberId) {
    const existing = teamMembers.find((row) => row.id === teamMemberId);
    if (existing) {
      defaultTeamMemberId = existing.id;
      preselectedName = existing.full_name;
    } else {
      ensureError = "Selected certification contact was not found.";
    }
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={fromTeam ? "/team" : "/certifications"}>
            <ArrowLeft className="h-4 w-4" />
            {fromTeam ? "Back to Team" : "Back to Certifications"}
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Add Certification</h1>
        <p className="mt-1 text-muted-foreground">
          {preselectedName
            ? `Add a certification for ${preselectedName} at ${church.name}.`
            : `Link a certification to a team member for ${church.name}.`}
        </p>
      </div>

      {ensureError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ensureError}
        </p>
      )}

      <NewCertificationForm
        teamMembers={teamMembers}
        defaultTeamMemberId={defaultTeamMemberId}
        lockedToDefault={Boolean(defaultTeamMemberId)}
      />
    </>
  );
}

function NewCertificationFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading…
      </CardContent>
    </Card>
  );
}

async function NewCertificationWrapper({
  searchParams,
}: {
  searchParams: Promise<{ membershipId?: string; teamMemberId?: string }>;
}) {
  const { membershipId, teamMemberId } = await searchParams;

  try {
    return (
      <NewCertificationContent
        membershipId={membershipId}
        teamMemberId={teamMemberId}
      />
    );
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load this page.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function NewCertificationPage({
  searchParams,
}: {
  searchParams: Promise<{ membershipId?: string; teamMemberId?: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense fallback={<NewCertificationFallback />}>
        <NewCertificationWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

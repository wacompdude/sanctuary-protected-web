import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TeamMembersTable } from "@/components/team/team-members-table";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/organization/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import {
  canInviteMembers,
  labelForMembershipRole,
} from "@/lib/organization/invitations";
import {
  canEditMemberProfile,
  canManageTeamMemberships,
} from "@/lib/organization/team";
import { listChurchTeamMemberships } from "@/lib/organization/team-queries";
import { listTeamMembersForChurch } from "@/lib/certifications/queries";
import { ResendInvitationButton } from "@/components/team/resend-invitation-button";
import { RevokeInvitationButton } from "@/components/team/revoke-invitation-button";
import { TeamOnboardingActions } from "@/components/team/team-onboarding-actions";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { formatChurchDate } from "@/lib/datetime/format";

type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
};

async function TeamContent({ created }: { created?: string }) {
  const { supabase, user, church, canManageCertifications, membership } =
    await getAuthenticatedUserWithChurch();
  const certContacts = await listTeamMembersForChurch(church.id);
  const canInvite = canInviteMembers(membership.role);
  const canManage = canManageTeamMemberships(membership.role);
  const canEditProfiles = canEditMemberProfile(membership.role);
  const churchMembers = await listChurchTeamMemberships(church.id);

  let pendingInvites: PendingInvitation[] = [];
  if (canInvite) {
    const { data: invites } = await supabase
      .from("organization_invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("organization_id", church.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    pendingInvites = (invites ?? []) as PendingInvitation[];
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="mt-1 text-muted-foreground">
            Manage who can access {church.name}. Choose Add for a new login, or
            Invite if they already sign in to Sanctuary Protected.
          </p>
        </div>
        {canInvite ? <TeamOnboardingActions /> : null}
      </div>

      {canInvite && !isServiceRoleConfigured() && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          Manual member setup needs <code>SUPABASE_SERVICE_ROLE_KEY</code> on the
          server and migration{" "}
          <code>020_provision_church_member.sql</code>.
        </p>
      )}

      {!canManage && (
        <p className="text-sm text-muted-foreground">
          Viewing only. Owners, administrators, and security leaders can manage
          memberships within their permissions.
        </p>
      )}

      {created === "1" && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Certification contact added successfully.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Church members</CardTitle>
          <CardDescription>
            {churchMembers.length} membership
            {churchMembers.length === 1 ? "" : "s"} (active, suspended, and
            removed). Memberships are never hard-deleted.
            {canEditProfiles
              ? " Owners, co-owners, and administrators can edit a member's name."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TeamMembersTable
            members={churchMembers}
            actorRole={membership.role}
            actorUserId={user.id}
            canManageCertifications={canManageCertifications}
            timeZone={church.timezone}
          />
        </CardContent>
      </Card>

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              {pendingInvites.length} open invitation
              {pendingInvites.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {pendingInvites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {labelForMembershipRole(invite.role)} · expires{" "}
                        {formatChurchDate(invite.expires_at, {
                          timeZone: church.timezone,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      <ResendInvitationButton
                        invitationId={invite.id}
                        email={invite.email}
                      />
                      <RevokeInvitationButton
                        invitationId={invite.id}
                        email={invite.email}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Certification contacts</CardTitle>
          <CardDescription>
            {certContacts.length} contact
            {certContacts.length === 1 ? "" : "s"} who can hold certifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {certContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No certification contacts yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {certContacts.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{member.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {[member.title, member.email].filter(Boolean).join(" · ") ||
                        "No title or email"}
                    </p>
                  </div>
                  {canManageCertifications && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={`/certifications/new?teamMemberId=${encodeURIComponent(member.id)}`}
                      >
                        Add certification
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function TeamFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading team…
      </CardContent>
    </Card>
  );
}

async function TeamWrapper({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;

  try {
    return <TeamContent created={created} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load team members.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
          {message.includes("015_team_management") && (
            <p className="mt-2 text-sm text-muted-foreground">
              Run <code>supabase/migrations/015_team_management.sql</code> in
              the Supabase SQL Editor.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }
}

export default function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<TeamFallback />}>
        <TeamWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

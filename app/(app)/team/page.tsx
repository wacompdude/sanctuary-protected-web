import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewTeamMemberForm } from "@/components/team/new-team-member-form";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { listTeamMembersForChurch } from "@/lib/certifications/queries";

async function TeamContent() {
  const { church, canManageCertifications } =
    await getAuthenticatedUserWithChurch();
  const members = await listTeamMembersForChurch(church.id);

  return (
    <>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
        <p className="mt-1 text-muted-foreground">
          People who can hold certifications for {church.name}.
        </p>
      </div>

      {canManageCertifications ? (
        <NewTeamMemberForm />
      ) : (
        <p className="text-sm text-muted-foreground">
          Viewing only. Administrators and security leaders can add team
          members.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active members</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No team members yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {members.map((member) => (
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

async function TeamWrapper() {
  try {
    return <TeamContent />;
  } catch (error) {
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
          <p className="mt-2 text-sm text-muted-foreground">
            Run <code>supabase/migrations/006_certifications.sql</code> in the
            Supabase SQL Editor if tables are missing.
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function TeamPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<TeamFallback />}>
        <TeamWrapper />
      </Suspense>
    </div>
  );
}

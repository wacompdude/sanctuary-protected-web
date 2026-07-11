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
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { listTeamMembersForChurch } from "@/lib/certifications/queries";
import { Plus } from "lucide-react";

async function TeamContent({ created }: { created?: string }) {
  const { church, canManageCertifications } =
    await getAuthenticatedUserWithChurch();
  const members = await listTeamMembersForChurch(church.id);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="mt-1 text-muted-foreground">
            People who can hold certifications for {church.name}.
          </p>
        </div>
        {canManageCertifications ? (
          <Button asChild>
            <Link href="/team/new">
              <Plus className="h-4 w-4" />
              Add Team Member
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Viewing only. Administrators and security leaders can add team
            members.
          </p>
        )}
      </div>

      {created === "1" && (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Team member added successfully.
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

async function TeamWrapper({ created }: { created?: string }) {
  try {
    return <TeamContent created={created} />;
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

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-8">
      <Suspense fallback={<TeamFallback />}>
        <TeamWrapper created={params.created} />
      </Suspense>
    </div>
  );
}

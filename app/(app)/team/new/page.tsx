import { Suspense } from "react";
import Link from "next/link";
import { NewTeamMemberForm } from "@/components/team/new-team-member-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { ArrowLeft } from "lucide-react";

async function NewTeamMemberContent() {
  const { canManageCertifications, church } =
    await getAuthenticatedUserWithChurch();

  if (!canManageCertifications) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only administrators and security leaders can add team members.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/team">
            <ArrowLeft className="h-4 w-4" />
            Back to Team Members
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Add Team Member</h1>
        <p className="mt-1 text-muted-foreground">
          Add someone who can hold certifications for {church.name}.
        </p>
      </div>

      <NewTeamMemberForm />
    </>
  );
}

function NewTeamMemberFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading…
      </CardContent>
    </Card>
  );
}

async function NewTeamMemberWrapper() {
  try {
    return <NewTeamMemberContent />;
  } catch (error) {
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

export default function NewTeamMemberPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense fallback={<NewTeamMemberFallback />}>
        <NewTeamMemberWrapper />
      </Suspense>
    </div>
  );
}

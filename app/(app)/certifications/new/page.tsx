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
import { listTeamMembersForChurch } from "@/lib/certifications/queries";
import { ArrowLeft } from "lucide-react";

async function NewCertificationContent() {
  const { canManageCertifications, church } =
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

  const teamMembers = await listTeamMembersForChurch(church.id);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/certifications">
            <ArrowLeft className="h-4 w-4" />
            Back to Certifications
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Add Certification</h1>
        <p className="mt-1 text-muted-foreground">
          Link a certification to a team member for {church.name}.
        </p>
      </div>

      <NewCertificationForm teamMembers={teamMembers} />
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

async function NewCertificationWrapper() {
  try {
    return <NewCertificationContent />;
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

export default function NewCertificationPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense fallback={<NewCertificationFallback />}>
        <NewCertificationWrapper />
      </Suspense>
    </div>
  );
}

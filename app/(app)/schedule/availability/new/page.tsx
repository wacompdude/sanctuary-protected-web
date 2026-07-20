import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { UnavailabilityForm } from "@/components/schedule/unavailability-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { getChurchScheduleSettings } from "@/lib/schedule/shift-queries";

async function NewAvailabilityContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);
  const settings = await getChurchScheduleSettings(church.id);
  const membersMayCreate =
    (settings as { members_may_create_unavailability?: boolean } | null)
      ?.members_may_create_unavailability !== false;

  if (!canManage && !membersMayCreate) {
    throw new ChurchAccessError(
      "Creating unavailability is disabled for members.",
    );
  }

  const members = canManage
    ? (await listChurchTeamMemberships(church.id))
        .filter((m) => m.status === "active")
        .map((m) => ({ membershipId: m.membershipId, name: m.name }))
    : [];

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/availability">
            <ArrowLeft className="h-4 w-4" />
            Back to availability
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Add unavailable time
        </h1>
        <p className="mt-1 text-muted-foreground">
          Prevent scheduling during this period unless an authorized override is
          used.
        </p>
      </div>
      <UnavailabilityForm
        mode="create"
        timeZone={church.timezone ?? "America/Los_Angeles"}
        canManageOthers={canManage}
        members={members}
      />
    </>
  );
}

async function NewAvailabilityWrapper() {
  try {
    return <NewAvailabilityContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to open form."}
        </CardContent>
      </Card>
    );
  }
}

export default function NewUnavailabilityPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <NewAvailabilityWrapper />
      </Suspense>
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ScheduleEventForm } from "@/components/schedule/schedule-event-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { listScheduleCampuses } from "@/lib/schedule/queries";

async function NewEventContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to create schedule events.",
    );
  }

  const campuses = await listScheduleCampuses(church.id).catch(() => []);
  const dateHint = typeof params.date === "string" ? params.date : null;

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/events">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New event</h1>
        <p className="mt-1 text-muted-foreground">
          Create a church activity that may need security coverage
          {dateHint ? ` starting ${dateHint}` : ""}.
        </p>
      </div>
      <ScheduleEventForm
        mode="create"
        campuses={campuses}
        timeZone={church.timezone ?? "America/Los_Angeles"}
      />
    </>
  );
}

async function NewEventWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <NewEventContent searchParams={searchParams} />;
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

export default function NewScheduleEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <NewEventWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

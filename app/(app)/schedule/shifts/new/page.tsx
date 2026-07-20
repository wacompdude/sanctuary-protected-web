import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { ScheduleShiftForm } from "@/components/schedule/schedule-shift-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { listScheduleCampuses } from "@/lib/schedule/queries";
import { listEventOptionsForShifts } from "@/lib/schedule/shift-queries";

async function NewShiftContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to create shifts.",
    );
  }

  const [campuses, events] = await Promise.all([
    listScheduleCampuses(church.id).catch(() => []),
    listEventOptionsForShifts(church.id),
  ]);

  const defaultEventId =
    typeof params.eventId === "string" ? params.eventId : null;

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/shifts">
            <ArrowLeft className="h-4 w-4" />
            Back to shifts
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New shift</h1>
        <p className="mt-1 text-muted-foreground">
          Define a coverage window and staffing requirements.
        </p>
      </div>
      <ScheduleShiftForm
        mode="create"
        campuses={campuses}
        events={events}
        timeZone={church.timezone ?? "America/Los_Angeles"}
        defaultEventId={defaultEventId}
      />
    </>
  );
}

async function NewShiftWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <NewShiftContent searchParams={searchParams} />;
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

export default function NewScheduleShiftPage({
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
        <NewShiftWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

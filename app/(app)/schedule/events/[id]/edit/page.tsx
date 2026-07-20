import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
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
import {
  getScheduleEventById,
  listScheduleCampuses,
} from "@/lib/schedule/queries";

async function EditEventContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to edit schedule events.",
    );
  }

  const [event, campuses] = await Promise.all([
    getScheduleEventById(id, church.id),
    listScheduleCampuses(church.id).catch(() => []),
  ]);

  if (!event) notFound();
  if (event.status === "cancelled" || event.status === "archived") {
    throw new ChurchAccessError(
      "Cancelled or archived events cannot be edited.",
    );
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={`/schedule/events/${event.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to event
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit event</h1>
        <p className="mt-1 text-muted-foreground">{event.title}</p>
      </div>
      <ScheduleEventForm
        mode="edit"
        event={event}
        campuses={campuses}
        timeZone={church.timezone ?? "America/Los_Angeles"}
      />
    </>
  );
}

async function EditEventWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <EditEventContent params={params} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to edit event."}
        </CardContent>
      </Card>
    );
  }
}

export default function EditScheduleEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
        <EditEventWrapper params={params} />
      </Suspense>
    </div>
  );
}

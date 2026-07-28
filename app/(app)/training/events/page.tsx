import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { EventStatusBadge } from "@/components/training/status-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { resolveCampusFilter } from "@/lib/campuses/filter";
import { formatChurchDate } from "@/lib/datetime/format";
import { getTrainingAccess } from "@/lib/training/access";
import { canManageEvents, canViewSensitive } from "@/lib/training/permissions";
import { listEvents } from "@/lib/training/queries";

async function TrainingEventsContent() {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });

  const events = await listEvents(church.id, {
    campusFilter,
    includeSensitive: canViewSensitive(membership.role),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Training events</h2>
          <p className="text-sm text-muted-foreground">
            Schedule and manage training sessions.
          </p>
        </div>
        {canManageEvents(membership.role) ? (
          <Button asChild>
            <Link href="/training/events/new">
              <Plus className="h-4 w-4" />
              New event
            </Link>
          </Button>
        ) : null}
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No training events yet.
            {canManageEvents(membership.role) ? (
              <>
                {" "}
                <Link href="/training/events/new" className="underline underline-offset-4">
                  Create your first event
                </Link>
                .
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      <Link
                        href={`/training/events/${event.id}`}
                        className="hover:underline"
                      >
                        {event.name}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {event.start_at
                        ? formatChurchDate(event.start_at, { timeZone: church.timezone })
                        : "Date TBD"}
                      {event.campus?.name ? ` · ${event.campus.name}` : ""}
                      {event.category?.name ? ` · ${event.category.name}` : ""}
                    </CardDescription>
                  </div>
                  <EventStatusBadge status={event.status} />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrainingEventsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingEventsContent />
    </Suspense>
  );
}

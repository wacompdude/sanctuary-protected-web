import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { CancelScheduleEventButton } from "@/components/schedule/cancel-schedule-event-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { formatChurchDateTime } from "@/lib/datetime/format";
import {
  labelForScheduleEventStatus,
  labelForScheduleEventType,
  labelForScheduleRiskLevel,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { getScheduleEventById } from "@/lib/schedule/queries";

async function EventDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);
  const event = await getScheduleEventById(id, church.id);

  if (!event) {
    // Distinguish missing migration vs not found loosely
    notFound();
  }

  const tz = church.timezone ?? event.timezone ?? "America/Los_Angeles";
  const cancelled = event.status === "cancelled" || event.status === "archived";

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/events">
            <ArrowLeft className="h-4 w-4" />
            Back to Events
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{event.title}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {labelForScheduleEventType(event.event_type)}
              </Badge>
              <Badge
                variant={
                  event.status === "cancelled" ? "destructive" : "outline"
                }
              >
                {labelForScheduleEventStatus(event.status)}
              </Badge>
              <Badge variant="outline">
                Risk: {labelForScheduleRiskLevel(event.risk_level)}
              </Badge>
              {event.recurrence_rule ? (
                <Badge variant="outline">Recurring</Badge>
              ) : null}
            </div>
          </div>
          {canManage && !cancelled ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/schedule/events/${event.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <CancelScheduleEventButton eventId={event.id} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>When</CardTitle>
            <CardDescription>Timezone: {tz}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Starts: </span>
              {formatChurchDateTime(event.start_at, { timeZone: tz })}
            </p>
            <p>
              <span className="text-muted-foreground">Ends: </span>
              {formatChurchDateTime(event.end_at, { timeZone: tz })}
            </p>
            {event.all_day ? (
              <p className="text-muted-foreground">All-day event</p>
            ) : null}
            {event.recurrence_rule ? (
              <p>
                <span className="text-muted-foreground">Recurrence: </span>
                {event.recurrence_rule}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Campus: </span>
              {event.campus_name ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Location: </span>
              {event.location_name ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Building / room: </span>
              {[event.building, event.room].filter(Boolean).join(" · ") || "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap">
            {event.description?.trim() || "No description provided."}
          </p>
          <p>
            <span className="text-muted-foreground">
              Security coverage required:{" "}
            </span>
            {event.security_coverage_required ? "Yes" : "No"}
          </p>
          <p>
            <span className="text-muted-foreground">Estimated attendance: </span>
            {event.estimated_attendance ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Related shifts</CardTitle>
          <CardDescription>
            {event.shift_count
              ? `${event.shift_count} active shift(s) linked.`
              : "No shifts linked yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/schedule/shifts?eventId=${event.id}`}>
              View shifts
            </Link>
          </Button>
          {canManage && !cancelled ? (
            <Button asChild>
              <Link href={`/schedule/shifts/new?eventId=${event.id}`}>
                Add shift
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

async function EventDetailWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <EventDetailContent params={params} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load this event. {SCHEDULE_MIGRATION_HINT}
        </CardContent>
      </Card>
    );
  }
}

export default function ScheduleEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading event…
            </CardContent>
          </Card>
        }
      >
        <EventDetailWrapper params={params} />
      </Suspense>
    </div>
  );
}

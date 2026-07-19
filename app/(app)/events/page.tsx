import { Suspense } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AcknowledgeEventButton } from "@/components/events/acknowledge-event-button";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listEventsForChurch } from "@/lib/events/queries";
import { EVENT_TYPES } from "@/lib/events/types";
import { formatDateTime } from "@/lib/incidents/format";
import { Plus } from "lucide-react";

function labelFor(
  options: { value: string; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

async function EventsContent() {
  const { church, canManageCertifications } =
    await getAuthenticatedUserWithChurch();
  const events = await listEventsForChurch(church.id);
  const unacked = events.filter(
    (event) => event.acknowledgment_status === "unacknowledged",
  ).length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="mt-1 text-muted-foreground">
            Device events for {church.name}. {unacked} unacknowledged.
          </p>
        </div>
        {canManageCertifications && (
          <Button asChild>
            <Link href="/events/new">
              <Plus className="h-4 w-4" />
              New Event
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Events</CardTitle>
          <CardDescription>
            {events.length} event{events.length === 1 ? "" : "s"} on record
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No events yet.
              {canManageCertifications && (
                <>
                  {" "}
                  <Link
                    href="/events/new"
                    className="underline underline-offset-4"
                  >
                    Create a test event
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Device
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Severity
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Timestamp
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Location
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium">{event.device}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {labelFor(EVENT_TYPES, event.event_type)}
                      </td>
                      <td className="py-3 pr-4 capitalize">{event.severity}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDateTime(
                          event.event_timestamp,
                          null,
                          church.timezone,
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {event.location}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant={
                            event.acknowledgment_status === "acknowledged"
                              ? "outline"
                              : "destructive"
                          }
                        >
                          {event.acknowledgment_status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {event.acknowledgment_status === "unacknowledged" ? (
                          <AcknowledgeEventButton eventId={event.id} />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Done
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function EventsFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading events…
      </CardContent>
    </Card>
  );
}

async function EventsWrapper() {
  try {
    return <EventsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load events.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Run <code>supabase/migrations/008_events.sql</code> in the Supabase
            SQL Editor if the events table is missing.
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function EventsPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<EventsFallback />}>
        <EventsWrapper />
      </Suspense>
    </div>
  );
}

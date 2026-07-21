import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { ScheduleEventFilters } from "@/components/schedule/schedule-event-filters";
import { ScheduleEventList } from "@/components/schedule/schedule-event-list";
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
import { SCHEDULE_MIGRATION_HINT } from "@/lib/schedule/constants";
import { canManageSchedule } from "@/lib/schedule/permissions";
import {
  listScheduleCampuses,
  listScheduleEvents,
} from "@/lib/schedule/queries";
import type { ScheduleEventStatus, ScheduleEventType } from "@/lib/schedule/types";
import {
  resolveCampusFilter,
  resolveListCampusFilterOr,
} from "@/lib/campuses/filter";

async function EventsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);
  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });

  const q = typeof params.q === "string" ? params.q : "";
  const type = typeof params.type === "string" ? params.type : "";
  const status = typeof params.status === "string" ? params.status : "";
  const campus = typeof params.campus === "string" ? params.campus : "";
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const [list, campuses] = await Promise.all([
    listScheduleEvents(church.id, {
      q,
      eventType: (type || "") as ScheduleEventType | "",
      status: (status || "") as ScheduleEventStatus | "",
      campusId: campus || undefined,
      campusFilterOr: resolveListCampusFilterOr(campusFilter, campus),
      includeCancelled: true,
      page,
    }),
    listScheduleCampuses(church.id).catch(() => []),
  ]);

  if (!list.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Events</CardTitle>
          <CardDescription>{SCHEDULE_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Events</h1>
          <p className="mt-1 text-muted-foreground">
            Church activities that may need security coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/schedule/calendar">
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Link>
          </Button>
          {canManage ? (
            <Button asChild>
              <Link href="/schedule/events/new">
                <Plus className="h-4 w-4" />
                New event
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ScheduleEventFilters campuses={campuses} />
        </CardContent>
      </Card>

      <ScheduleEventList
        items={list.items}
        timeZone={church.timezone ?? "America/Los_Angeles"}
      />

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {list.page} of {totalPages} ({list.total} total)
          </span>
          <div className="flex gap-2">
            {list.page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/schedule/events?page=${list.page - 1}`}>
                  Previous
                </Link>
              </Button>
            ) : null}
            {list.page < totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/schedule/events?page=${list.page + 1}`}>
                  Next
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

async function EventsWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <EventsContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load events.
        </CardContent>
      </Card>
    );
  }
}

export default function ScheduleEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading events…
            </CardContent>
          </Card>
        }
      >
        <EventsWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

import { Suspense } from "react";
import { ScheduleCalendar } from "@/components/schedule/schedule-calendar";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { canManageSchedule } from "@/lib/schedule/permissions";
import {
  listScheduleCalendarItems,
  listScheduleCampuses,
} from "@/lib/schedule/queries";
import { getTypedChurchScheduleSettings } from "@/lib/schedule/settings-queries";
import type { ScheduleCalendarView } from "@/lib/schedule/types";

async function CalendarContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);

  const type = typeof params.type === "string" ? params.type : "";
  const campus = typeof params.campus === "string" ? params.campus : "";
  const settings = await getTypedChurchScheduleSettings(church.id).catch(
    () => null,
  );
  const defaultView = settings?.default_calendar_view ?? "month";
  const viewRaw =
    typeof params.view === "string" ? params.view : defaultView;
  const view = (
    ["month", "week", "day", "agenda"].includes(viewRaw)
      ? viewRaw
      : defaultView
  ) as ScheduleCalendarView;
  const anchor = typeof params.date === "string" ? params.date : undefined;

  // Load a wide window so month/week/day/agenda all have data client-side.
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0, 23, 59, 59);

  const [calendar, campuses] = await Promise.all([
    listScheduleCalendarItems(
      church.id,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      {
        eventType: type || undefined,
        campusId: campus || undefined,
        includeCancelled: params.cancelled === "1",
      },
    ),
    listScheduleCampuses(church.id).catch(() => []),
  ]);

  return (
    <ScheduleCalendar
      items={calendar.items}
      campuses={campuses}
      timeZone={church.timezone ?? "America/Los_Angeles"}
      canManage={canManage}
      tablesAvailable={calendar.tablesAvailable}
      migrationHint={calendar.hint}
      initialView={view}
      initialAnchor={anchor}
    />
  );
}

async function CalendarWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <CalendarContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load the calendar.
        </CardContent>
      </Card>
    );
  }
}

export default function ScheduleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading calendar…
            </CardContent>
          </Card>
        }
      >
        <CalendarWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

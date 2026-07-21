import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Plus } from "lucide-react";
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
  labelForScheduleShiftStatus,
  labelForScheduleShiftType,
  SCHEDULE_MIGRATION_HINT,
  SCHEDULE_SHIFT_STATUSES,
  SCHEDULE_SHIFT_TYPES,
} from "@/lib/schedule/constants";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { listScheduleCampuses } from "@/lib/schedule/queries";
import { listScheduleShifts } from "@/lib/schedule/shift-queries";
import type {
  ScheduleShiftStatus,
  ScheduleShiftType,
} from "@/lib/schedule/types";
import {
  resolveCampusFilter,
  resolveListCampusFilterOr,
} from "@/lib/campuses/filter";

async function ShiftsContent({
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
  const status = typeof params.status === "string" ? params.status : "";
  const type = typeof params.type === "string" ? params.type : "";
  const campus = typeof params.campus === "string" ? params.campus : "";
  const eventId = typeof params.eventId === "string" ? params.eventId : "";
  const unfilled = params.unfilled === "1";
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const [list, campuses] = await Promise.all([
    listScheduleShifts(church.id, {
      q,
      status: (status || "") as ScheduleShiftStatus | "",
      shiftType: (type || "") as ScheduleShiftType | "",
      campusId: campus || undefined,
      campusFilterOr: resolveListCampusFilterOr(campusFilter, campus),
      eventId: eventId || undefined,
      unfilledOnly: unfilled,
      page,
    }),
    listScheduleCampuses(church.id).catch(() => []),
  ]);

  if (!list.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team shifts</CardTitle>
          <CardDescription>{SCHEDULE_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tz = church.timezone ?? "America/Los_Angeles";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team shifts</h1>
          <p className="mt-1 text-muted-foreground">
            Staffing coverage windows and open positions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/schedule/my-schedule">My schedule</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/schedule/calendar">
              <CalendarDays className="h-4 w-4" />
              Calendar
            </Link>
          </Button>
          {canManage ? (
            <Button asChild>
              <Link href="/schedule/shifts/new">
                <Plus className="h-4 w-4" />
                New shift
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="q">
                Search
              </label>
              <input
                id="q"
                name="q"
                defaultValue={q}
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-48"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={status}
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {SCHEDULE_SHIFT_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="type">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={type}
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {SCHEDULE_SHIFT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="campus">
                Campus
              </label>
              <select
                id="campus"
                name="campus"
                defaultValue={campus}
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {campuses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="unfilled"
                value="1"
                defaultChecked={unfilled}
              />
              Unfilled only
            </label>
            <Button type="submit">Filter</Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Shift</th>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Staffing</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-muted-foreground">
                  No shifts match these filters.
                </td>
              </tr>
            ) : (
              list.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <Link
                      href={`/schedule/shifts/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {labelForScheduleShiftType(item.shift_type)}
                      {item.campus_name ? ` · ${item.campus_name}` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {formatChurchDateTime(item.start_at, { timeZone: tz })} –
                    <br />
                    {formatChurchDateTime(item.end_at, { timeZone: tz })}
                  </td>
                  <td className="px-3 py-3">
                    {item.event_id ? (
                      <Link
                        href={`/schedule/events/${item.event_id}`}
                        className="hover:underline"
                      >
                        {item.event_title ?? "Event"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {item.confirmed_assignment_count}/
                    {item.required_member_count}
                    {(item.open_positions ?? 0) > 0 ? (
                      <Badge variant="destructive" className="ml-2">
                        {item.open_positions} open
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="ml-2">
                        Filled
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      variant={
                        item.status === "cancelled" ? "destructive" : "outline"
                      }
                    >
                      {labelForScheduleShiftStatus(item.status)}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function ShiftsWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <ShiftsContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load shifts.
        </CardContent>
      </Card>
    );
  }
}

export default function ScheduleShiftsPage({
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
              Loading shifts…
            </CardContent>
          </Card>
        }
      >
        <ShiftsWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

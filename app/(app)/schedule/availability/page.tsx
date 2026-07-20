import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { CancelUnavailabilityButton } from "@/components/schedule/cancel-unavailability-button";
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
  listAvailabilityConflicts,
  listMyUnavailability,
  getTeamAvailabilityView,
} from "@/lib/schedule/availability-queries";
import {
  labelForUnavailabilityReason,
  labelForUnavailabilityStatus,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import {
  canManageSchedule,
  canViewTeamUnavailability,
} from "@/lib/schedule/permissions";
import { getChurchScheduleSettings } from "@/lib/schedule/shift-queries";

async function AvailabilityContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);
  const canViewTeam = canViewTeamUnavailability(membership.role);
  const settings = await getChurchScheduleSettings(church.id);
  const membersMayCreate =
    (settings as { members_may_create_unavailability?: boolean } | null)
      ?.members_may_create_unavailability !== false;

  const view =
    typeof params.view === "string" && canViewTeam ? params.view : "mine";
  const tz = church.timezone ?? "America/Los_Angeles";

  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const myList = await listMyUnavailability(church.id, user.id);
  if (!myList.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Availability</CardTitle>
          <CardDescription>
            {myList.hint ?? SCHEDULE_MIGRATION_HINT}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const teamView =
    canViewTeam && view === "team"
      ? await getTeamAvailabilityView(
          church.id,
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
        )
      : null;

  const conflictsView =
    canViewTeam && view === "conflicts"
      ? await listAvailabilityConflicts(
          church.id,
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
        )
      : null;

  const activeMine = myList.items.filter((item) => item.status === "active");
  const canCreate = canManage || membersMayCreate;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Availability</h1>
          <p className="mt-1 text-muted-foreground">
            Mark when you cannot be scheduled. Private notes stay private.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <Button asChild>
              <Link href="/schedule/availability/new">
                <Plus className="h-4 w-4" />
                Add unavailable time
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href="/schedule/my-schedule">My schedule</Link>
          </Button>
        </div>
      </div>

      {canViewTeam ? (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["mine", "My availability"],
              ["team", "Team availability"],
              ["conflicts", "Conflicts"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={view === key ? "default" : "outline"}
              asChild
            >
              <Link href={`/schedule/availability?view=${key}`}>{label}</Link>
            </Button>
          ))}
        </div>
      ) : null}

      {view === "mine" ? (
        <Card>
          <CardHeader>
            <CardTitle>My unavailable periods</CardTitle>
            <CardDescription>
              {activeMine.length} active · schedulers see times only, not private
              notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {myList.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You have not added any unavailable periods.
              </p>
            ) : (
              myList.items.map((item) => {
                const future =
                  new Date(item.end_at).getTime() >= Date.now() &&
                  item.status === "active";
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">
                        {item.title?.trim() || "Unavailable"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.all_day
                          ? `${formatChurchDateTime(item.start_at, { timeZone: tz }).split(" ")[0]} – ${formatChurchDateTime(item.end_at, { timeZone: tz }).split(" ")[0]}`
                          : `${formatChurchDateTime(item.start_at, { timeZone: tz })} – ${formatChurchDateTime(item.end_at, { timeZone: tz })}`}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {labelForUnavailabilityReason(item.reason_category)}
                        </Badge>
                        <Badge
                          variant={
                            item.status === "cancelled"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {labelForUnavailabilityStatus(item.status)}
                        </Badge>
                        {item.recurrence_rule ? (
                          <Badge variant="outline">Recurring</Badge>
                        ) : null}
                      </div>
                      {item.notes ? (
                        <p className="text-xs text-muted-foreground">
                          Private note: {item.notes}
                        </p>
                      ) : null}
                    </div>
                    {item.status === "active" ? (
                      <div className="flex flex-wrap gap-2">
                        {future || canManage ? (
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={`/schedule/availability/${item.id}/edit`}
                            >
                              Edit
                            </Link>
                          </Button>
                        ) : null}
                        {(future || canManage) && (
                          <CancelUnavailabilityButton
                            unavailabilityId={item.id}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "team" && teamView ? (
        <Card>
          <CardHeader>
            <CardTitle>Team availability</CardTitle>
            <CardDescription>
              Current month · times only (no private notes)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teamView.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members.</p>
            ) : (
              teamView.rows.map((row) => (
                <div key={row.membershipId} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.role}</p>
                    </div>
                    {row.conflictCount > 0 ? (
                      <Badge variant="destructive">
                        {row.conflictCount} conflict
                        {row.conflictCount === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">No conflicts</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                        Unavailable
                      </p>
                      {row.unavailableBlocks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {row.unavailableBlocks.map((block) => (
                            <li key={block.id}>
                              Member unavailable ·{" "}
                              {formatChurchDateTime(block.start_at, {
                                timeZone: tz,
                              })}{" "}
                              –{" "}
                              {formatChurchDateTime(block.end_at, {
                                timeZone: tz,
                              })}
                              <span className="sr-only">
                                {" "}
                                Reason category{" "}
                                {labelForUnavailabilityReason(
                                  block.reason_category,
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                        Assignments
                      </p>
                      {row.assignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">None</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {row.assignments.map((assignment) => (
                            <li key={assignment.id}>
                              <Link
                                href={`/schedule/shifts/${assignment.shift_id}`}
                                className="hover:underline"
                              >
                                {assignment.shift_title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {view === "conflicts" && conflictsView ? (
        <Card>
          <CardHeader>
            <CardTitle>Availability conflicts</CardTitle>
            <CardDescription>
              Assignments that overlap unavailable periods this month
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflictsView.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No overlapping conflicts in this range.
              </p>
            ) : (
              conflictsView.items.map((item) => (
                <div
                  key={`${item.assignmentId}-${item.unavailabilityId}`}
                  className="rounded-md border p-3 text-sm"
                >
                  <p className="font-medium">{item.memberName}</p>
                  <p className="text-muted-foreground">
                    Unavailable{" "}
                    {formatChurchDateTime(item.unavailabilityStart, {
                      timeZone: tz,
                    })}{" "}
                    –{" "}
                    {formatChurchDateTime(item.unavailabilityEnd, {
                      timeZone: tz,
                    })}
                  </p>
                  <p>
                    Assigned to{" "}
                    <Link
                      href={`/schedule/shifts/${item.shiftId}`}
                      className="underline"
                    >
                      {item.shiftTitle}
                    </Link>{" "}
                    ({item.assignmentStatus})
                    {item.overridden ? (
                      <Badge variant="outline" className="ml-2">
                        Override recorded
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="ml-2">
                        Conflict
                      </Badge>
                    )}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

async function AvailabilityWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return <AvailabilityContent searchParams={searchParams} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load availability.
        </CardContent>
      </Card>
    );
  }
}

export default function ScheduleAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading availability…
            </CardContent>
          </Card>
        }
      >
        <AvailabilityWrapper searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

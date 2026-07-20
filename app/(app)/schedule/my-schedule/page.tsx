import Link from "next/link";
import { Suspense } from "react";
import { AssignmentResponseForm } from "@/components/schedule/assignment-response-form";
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
  labelForScheduleAssignmentRole,
  labelForScheduleAssignmentStatus,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import { listMyAssignments } from "@/lib/schedule/shift-queries";

async function MyScheduleContent() {
  const { user, church } = await getAuthenticatedUserWithChurch();
  const assignments = await listMyAssignments(church.id, user.id);
  const tz = church.timezone ?? "America/Los_Angeles";

  const upcoming = assignments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "declined" &&
      a.shift_start_at &&
      new Date(a.shift_start_at).getTime() >= Date.now() - 6 * 60 * 60 * 1000,
  );
  const pending = assignments.filter(
    (a) => a.status === "invited" || a.status === "pending",
  );
  const past = assignments.filter(
    (a) =>
      a.shift_end_at &&
      new Date(a.shift_end_at).getTime() < Date.now() &&
      a.status !== "invited" &&
      a.status !== "pending",
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My schedule</h1>
          <p className="mt-1 text-muted-foreground">
            Your assignments for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/schedule/availability">Availability</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/schedule/shifts">Team shifts</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/schedule/calendar">Calendar</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Needs response</CardTitle>
          <CardDescription>
            Accept or decline invitations securely in the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending invitations.
            </p>
          ) : (
            pending.map((assignment) => (
              <div
                key={assignment.id}
                className="space-y-3 rounded-md border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/schedule/shifts/${assignment.shift_id}`}
                      className="font-medium hover:underline"
                    >
                      {assignment.shift_title ?? "Shift"}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {assignment.shift_start_at
                        ? `${formatChurchDateTime(assignment.shift_start_at, { timeZone: tz })} – ${formatChurchDateTime(assignment.shift_end_at, { timeZone: tz })}`
                        : "Time TBA"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labelForScheduleAssignmentRole(
                        assignment.assignment_role,
                      )}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {labelForScheduleAssignmentStatus(assignment.status)}
                  </Badge>
                </div>
                <AssignmentResponseForm assignmentId={assignment.id} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming shifts.</p>
          ) : (
            upcoming.map((assignment) => (
              <Link
                key={assignment.id}
                href={`/schedule/shifts/${assignment.shift_id}`}
                className="flex flex-col gap-1 rounded-md border p-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {assignment.shift_title ?? "Shift"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {assignment.shift_start_at
                      ? formatChurchDateTime(assignment.shift_start_at, {
                          timeZone: tz,
                        })
                      : "—"}
                  </p>
                </div>
                <Badge variant="outline">
                  {labelForScheduleAssignmentStatus(assignment.status)}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground">No past assignments.</p>
          ) : (
            past.slice(0, 20).map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <span>{assignment.shift_title ?? "Shift"}</span>
                <Badge variant="outline">
                  {labelForScheduleAssignmentStatus(assignment.status)}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function MyScheduleWrapper() {
  try {
    return <MyScheduleContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load your schedule. {SCHEDULE_MIGRATION_HINT}
        </CardContent>
      </Card>
    );
  }
}

export default function MySchedulePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading your schedule…
            </CardContent>
          </Card>
        }
      >
        <MyScheduleWrapper />
      </Suspense>
    </div>
  );
}

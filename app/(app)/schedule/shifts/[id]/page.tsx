import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { AssignMemberForm } from "@/components/schedule/assign-member-form";
import {
  CancelAssignmentButton,
  CancelScheduleShiftButton,
} from "@/components/schedule/cancel-shift-buttons";
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
  labelForSchedulePriority,
  labelForScheduleShiftStatus,
  labelForScheduleShiftType,
} from "@/lib/schedule/constants";
import { canManageSchedule } from "@/lib/schedule/permissions";
import {
  getScheduleShiftById,
  listAssignmentsForShift,
  listEligibleMembersForShift,
} from "@/lib/schedule/shift-queries";

async function ShiftDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);
  const shift = await getScheduleShiftById(id, church.id);
  if (!shift) notFound();

  const tz = church.timezone ?? shift.timezone ?? "America/Los_Angeles";
  const cancelled = shift.status === "cancelled";
  const [assignments, eligible] = await Promise.all([
    listAssignmentsForShift(shift.id, church.id),
    canManage && !cancelled
      ? listEligibleMembersForShift(church.id, shift, {
          allowOverride: true,
        })
      : Promise.resolve({ members: [], tablesAvailable: true }),
  ]);

  const pending = assignments.filter(
    (a) => a.status === "invited" || a.status === "pending",
  );
  const confirmed = assignments.filter(
    (a) =>
      a.status === "accepted" ||
      a.status === "confirmed" ||
      a.status === "completed",
  );
  const declined = assignments.filter((a) => a.status === "declined");

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/shifts">
            <ArrowLeft className="h-4 w-4" />
            Back to shifts
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">{shift.title}</h1>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {labelForScheduleShiftType(shift.shift_type)}
              </Badge>
              <Badge
                variant={
                  shift.status === "cancelled" ? "destructive" : "outline"
                }
              >
                {labelForScheduleShiftStatus(shift.status)}
              </Badge>
              <Badge variant="outline">
                Priority: {labelForSchedulePriority(shift.priority)}
              </Badge>
              {(shift.open_positions ?? 0) > 0 ? (
                <Badge variant="destructive">
                  {shift.open_positions} open position
                  {(shift.open_positions ?? 0) === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge variant="secondary">Fully staffed</Badge>
              )}
            </div>
          </div>
          {canManage && !cancelled ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/schedule/shifts/${shift.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Link>
              </Button>
              <CancelScheduleShiftButton shiftId={shift.id} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>When & where</CardTitle>
            <CardDescription>Timezone: {tz}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {formatChurchDateTime(shift.start_at, { timeZone: tz })} –{" "}
              {formatChurchDateTime(shift.end_at, { timeZone: tz })}
            </p>
            <p>
              <span className="text-muted-foreground">Event: </span>
              {shift.event_id ? (
                <Link
                  href={`/schedule/events/${shift.event_id}`}
                  className="underline"
                >
                  {shift.event_title ?? "Related event"}
                </Link>
              ) : (
                "Standalone"
              )}
            </p>
            <p>
              <span className="text-muted-foreground">Campus: </span>
              {shift.campus_name ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Location: </span>
              {[shift.location_name, shift.building, shift.room]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staffing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Confirmed {shift.confirmed_assignment_count} of{" "}
              {shift.required_member_count} required
            </p>
            <p>
              Minimum certified: {shift.minimum_certified_member_count}
              {shift.required_certifications.length
                ? ` (${shift.required_certifications.join(", ")})`
                : ""}
            </p>
            <p>Team lead required: {shift.lead_member_required ? "Yes" : "No"}</p>
            {shift.notes ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {shift.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
          <CardDescription>
            {confirmed.length} confirmed · {pending.length} pending ·{" "}
            {declined.length} declined
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          ) : (
            <ul className="space-y-2">
              {assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {assignment.member_name ?? "Member"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labelForScheduleAssignmentRole(assignment.assignment_role)}{" "}
                      · {labelForScheduleAssignmentStatus(assignment.status)}
                      {assignment.conflict_override
                        ? " · conflict override"
                        : ""}
                    </p>
                  </div>
                  {canManage &&
                  assignment.status !== "cancelled" &&
                  assignment.status !== "declined" &&
                  !cancelled ? (
                    <CancelAssignmentButton
                      assignmentId={assignment.id}
                      shiftId={shift.id}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage && !cancelled ? (
        <AssignMemberForm
          shiftId={shift.id}
          members={eligible.members}
          canOverride={canManage}
        />
      ) : null}
    </>
  );
}

async function ShiftDetailWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <ShiftDetailContent params={params} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Unable to load this shift.
        </CardContent>
      </Card>
    );
  }
}

export default function ScheduleShiftDetailPage({
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
              Loading shift…
            </CardContent>
          </Card>
        }
      >
        <ShiftDetailWrapper params={params} />
      </Suspense>
    </div>
  );
}

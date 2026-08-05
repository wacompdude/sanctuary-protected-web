import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AttendancePanel } from "@/components/training/attendance-panel";
import { TrainingEventForm } from "@/components/training/event-form";
import { EventStatusBadge } from "@/components/training/status-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cancelTrainingEventFormAction,
  updateTrainingEvent,
} from "@/app/(app)/training/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { listChurchTeamMemberships } from "@/lib/organization/team-queries";
import { formatChurchDate } from "@/lib/datetime/format";
import { getTrainingAccess } from "@/lib/training/access";
import {
  canManageEvents,
  canRecordAttendance,
  canViewSensitive,
} from "@/lib/training/permissions";
import {
  collectRequiredCourseIds,
  userIdsMissingCourseCompletion,
} from "@/lib/training/compliance-shared";
import {
  getEvent,
  listCampusesForTraining,
  listCategories,
  listCompletionRecords,
  listCourses,
  listParticipants,
  listRequirements,
} from "@/lib/training/queries";
import { AddParticipantsForm } from "@/components/training/add-participants-form";

async function TrainingEventDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const includeSensitive = canViewSensitive(membership.role);
  const event = await getEvent(church.id, id, { includeSensitive });
  if (!event) notFound();

  const [participants, campuses, categories, courses, members, requirements] =
    await Promise.all([
      listParticipants(church.id, id),
      listCampusesForTraining(church.id),
      listCategories(church.id, { includeSensitive }),
      listCourses(church.id, { includeSensitive }),
      listChurchTeamMemberships(church.id),
      listRequirements(church.id),
    ]);

  const courseId = event.training_course_id;
  const requiredCourseIds = collectRequiredCourseIds({ requirements, courses });
  const courseIsRequired = Boolean(courseId && requiredCourseIds.has(courseId));

  const courseCompletions =
    courseIsRequired && courseId
      ? await listCompletionRecords(church.id, {
          courseId,
          includeSensitive,
        })
      : [];

  const missingRequiredUserIds =
    courseIsRequired && courseId
      ? [
          ...userIdsMissingCourseCompletion({
            teamMembers: members.filter((member) => member.status === "active"),
            courseId,
            completions: courseCompletions,
          }),
        ]
      : [];

  const canManage = canManageEvents(membership.role);
  const canAttendance = canRecordAttendance(membership.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{event.name}</h2>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {event.start_at
              ? formatChurchDate(event.start_at, { timeZone: church.timezone })
              : "Date TBD"}
            {event.campus?.name ? ` · ${event.campus.name}` : ""}
          </p>
        </div>
        {canManage && event.status !== "cancelled" ? (
          <form action={cancelTrainingEventFormAction.bind(null, id)}>
            <Button type="submit" variant="outline">
              Cancel event
            </Button>
          </form>
        ) : null}
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit event</CardTitle>
          </CardHeader>
          <CardContent>
            <TrainingEventForm
              action={updateTrainingEvent.bind(null, id)}
              initial={event}
              campuses={campuses.map((campus) => ({
                id: String(campus.id),
                name: String(campus.name),
              }))}
              categories={categories.map((category) => ({
                id: category.id,
                name: category.name,
              }))}
              courses={courses.map((course) => ({
                id: course.id,
                name: course.name,
                training_category_id: course.training_category_id,
              }))}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {event.description ? <p>{event.description}</p> : null}
            {event.location ? <p>Location: {event.location}</p> : null}
            {event.instructor_name ? (
              <p>Instructor: {event.instructor_name}</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
          <CardDescription>
            {participants.length} enrolled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canAttendance ? (
            <AddParticipantsForm
              eventId={id}
              members={members.filter((member) => member.status === "active")}
              existingUserIds={participants.map((p) => p.user_id)}
              missingRequiredUserIds={missingRequiredUserIds}
            />
          ) : null}
          <AttendancePanel
            eventId={id}
            participants={participants}
            canManage={canAttendance}
            missingRequiredUserIds={missingRequiredUserIds}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function TrainingEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingEventDetailContent params={params} />
    </Suspense>
  );
}

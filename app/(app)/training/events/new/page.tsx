import { Suspense } from "react";
import { TrainingEventForm } from "@/components/training/event-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createTrainingEvent } from "@/app/(app)/training/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { getTrainingAccess } from "@/lib/training/access";
import {
  listCampusesForTraining,
  listCategories,
  listCourses,
} from "@/lib/training/queries";
import { canManageEvents, canViewSensitive } from "@/lib/training/permissions";
import { redirect } from "next/navigation";

async function NewTrainingEventContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;
  if (!canManageEvents(membership.role)) redirect("/training/events");

  const includeSensitive = canViewSensitive(membership.role);
  const [campuses, categories, courses] = await Promise.all([
    listCampusesForTraining(church.id),
    listCategories(church.id, { includeSensitive }),
    listCourses(church.id, { includeSensitive }),
  ]);

  const courseId =
    typeof params.courseId === "string" ? params.courseId : undefined;
  const categoryId =
    typeof params.categoryId === "string" ? params.categoryId : undefined;
  const dateParam = typeof params.date === "string" ? params.date : undefined;
  const selectedCourse = courses.find((course) => course.id === courseId);
  const startPrefill =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? `${dateParam}T09:00:00`
      : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New training event</CardTitle>
        <CardDescription>
          Create a training session for your security team.
          {selectedCourse
            ? ` Prefilling course: ${selectedCourse.name}.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TrainingEventForm
          action={createTrainingEvent}
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
          initial={{
            name: selectedCourse
              ? `${selectedCourse.name} session`
              : undefined,
            training_course_id: selectedCourse?.id ?? courseId ?? null,
            training_category_id:
              selectedCourse?.training_category_id ?? categoryId ?? null,
            start_at: startPrefill ?? null,
            status: "scheduled",
            required: selectedCourse?.required ?? true,
          }}
          submitLabel="Create event"
        />
      </CardContent>
    </Card>
  );
}

export default function NewTrainingEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <NewTrainingEventContent searchParams={searchParams} />
    </Suspense>
  );
}

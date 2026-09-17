import Link from "next/link";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { getTrainingAccess } from "@/lib/training/access";
import { dedupeTrainingCoursesByCategory } from "@/lib/training/course-dedupe";
import { canManageCourses, canViewSensitive } from "@/lib/training/permissions";
import { listCategories, listCourses } from "@/lib/training/queries";
import { TRAINING_DELIVERY_METHOD_LABELS } from "@/lib/training/constants";
import { CreateCourseForm } from "@/components/training/create-course-form";
import { CategoryManagementPanel } from "@/components/training/category-management-panel";
import { cn } from "@/lib/utils";

async function TrainingCoursesContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const includeSensitive = canViewSensitive(membership.role);
  const showStarterTopics =
    typeof params.all === "string" ? params.all === "1" : false;

  const [categories, courses] = await Promise.all([
    listCategories(church.id, { includeSensitive }),
    listCourses(church.id, { includeSensitive }),
  ]);

  const deduped = dedupeTrainingCoursesByCategory(courses);
  const hasCustom = deduped.some((course) => !course.is_system);
  const visibleCourses =
    showStarterTopics || !hasCustom
      ? deduped
      : deduped.filter((course) => !course.is_system);
  const hiddenStarterCount = hasCustom
    ? deduped.filter((course) => course.is_system).length
    : 0;

  const coursesByCategory = categories
    .map((category) => ({
      category,
      courses: visibleCourses.filter(
        (course) => course.training_category_id === category.id,
      ),
    }))
    .filter((group) => group.courses.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Course catalog</h2>
          <p className="text-sm text-muted-foreground">
            Courses organized by category. Overlapping system starter topics are
            folded into matching church courses.
          </p>
        </div>
        {hiddenStarterCount > 0 ? (
          <Link
            href={
              showStarterTopics ? "/training/courses" : "/training/courses?all=1"
            }
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            {showStarterTopics
              ? "Hide starter topics"
              : `Show ${hiddenStarterCount} starter topics`}
          </Link>
        ) : null}
      </div>

      {canManageCourses(membership.role) ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <CreateCourseForm categories={categories} />
          <CategoryManagementPanel categories={categories} />
        </div>
      ) : null}

      {coursesByCategory.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No courses available.
          </CardContent>
        </Card>
      ) : (
        coursesByCategory.map(({ category, courses: categoryCourses }) => (
          <Card key={category.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{category.name}</CardTitle>
                <Badge variant="outline">
                  {categoryCourses.length} course
                  {categoryCourses.length === 1 ? "" : "s"}
                </Badge>
                {category.sensitive ? (
                  <Badge variant="secondary">Sensitive</Badge>
                ) : null}
              </div>
              {category.description_effective ? (
                <CardDescription>
                  {category.description_effective}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-md border">
                {categoryCourses.map((course) => (
                  <li
                    key={course.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{course.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {TRAINING_DELIVERY_METHOD_LABELS[course.delivery_method]}
                        {course.renewal_months
                          ? ` · Renews every ${course.renewal_months} mo`
                          : ""}
                        {course.is_system ? " · System topic" : " · Church course"}
                      </p>
                    </div>
                    {course.required ? (
                      <Badge variant="outline">Required</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function TrainingCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingCoursesContent searchParams={searchParams} />
    </Suspense>
  );
}

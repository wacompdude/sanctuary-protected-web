import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { getTrainingAccess } from "@/lib/training/access";
import { canManageCourses, canViewSensitive } from "@/lib/training/permissions";
import { listCategories, listCourses } from "@/lib/training/queries";
import { TRAINING_DELIVERY_METHOD_LABELS } from "@/lib/training/constants";
import { CreateCourseForm } from "@/components/training/create-course-form";
import { CategoryManagementPanel } from "@/components/training/category-management-panel";

async function TrainingCoursesContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const includeSensitive = canViewSensitive(membership.role);
  const [categories, courses] = await Promise.all([
    listCategories(church.id, { includeSensitive }),
    listCourses(church.id, { includeSensitive }),
  ]);

  const coursesByCategory = categories.map((category) => ({
    category,
    courses: courses.filter(
      (course) => course.training_category_id === category.id,
    ),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Course catalog</h2>
        <p className="text-sm text-muted-foreground">
          System and custom courses organized by category.
        </p>
      </div>

      {canManageCourses(membership.role) ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <CreateCourseForm categories={categories} />
          <CategoryManagementPanel categories={categories} />
        </div>
      ) : null}

      {coursesByCategory.every((group) => group.courses.length === 0) ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No courses available.
          </CardContent>
        </Card>
      ) : (
        coursesByCategory.map(({ category, courses: categoryCourses }) =>
          categoryCourses.length === 0 ? null : (
            <Card key={category.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{category.name}</CardTitle>
                  {category.sensitive ? (
                    <Badge variant="secondary">Sensitive</Badge>
                  ) : null}
                </div>
                {category.description_effective ? (
                  <CardDescription>{category.description_effective}</CardDescription>
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
          ),
        )
      )}
    </div>
  );
}

export default function TrainingCoursesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingCoursesContent />
    </Suspense>
  );
}

import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RequirementForm } from "@/components/training/requirement-form";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { getTrainingAccess } from "@/lib/training/access";
import { canManageRequirements } from "@/lib/training/permissions";
import { listCategories, listCourses, listRequirements } from "@/lib/training/queries";
import { TRAINING_ASSIGNMENT_TYPE_LABELS } from "@/lib/training/constants";

async function TrainingRequiredContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const [requirements, courses, categories] = await Promise.all([
    listRequirements(church.id),
    listCourses(church.id),
    listCategories(church.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Required training</h2>
        <p className="text-sm text-muted-foreground">
          Rules defining mandatory training for roles, teams, or all security.
        </p>
      </div>

      {canManageRequirements(membership.role) ? (
        <RequirementForm courses={courses} categories={categories} />
      ) : null}

      {requirements.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No requirements defined yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requirements.map((requirement) => (
            <Card key={requirement.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{requirement.name}</CardTitle>
                  <Badge variant={requirement.active ? "default" : "outline"}>
                    {requirement.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Applies to:{" "}
                  {TRAINING_ASSIGNMENT_TYPE_LABELS[requirement.assignment_type]}
                </p>
                {requirement.course?.name ? (
                  <p>Course: {requirement.course.name}</p>
                ) : null}
                {requirement.category?.name ? (
                  <p>Category: {requirement.category.name}</p>
                ) : null}
                {requirement.due_at ? <p>Due: {requirement.due_at}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TrainingRequiredPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingRequiredContent />
    </Suspense>
  );
}

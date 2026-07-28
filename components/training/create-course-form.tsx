"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createCourse } from "@/app/(app)/training/actions";
import type { TrainingCategoryWithState } from "@/lib/training/types";

export function CreateCourseForm({
  categories,
}: {
  categories: TrainingCategoryWithState[];
}) {
  const [state, action, pending] = useActionState(createCourse, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add custom course</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-3">
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              {state.success}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="course_name">Course name</Label>
            <Input id="course_name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course_category">Category</Label>
            <select
              id="course_category"
              name="training_category_id"
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="renewal_months">Renewal (months)</Label>
            <Input id="renewal_months" name="renewal_months" type="number" min={1} />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Create course
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

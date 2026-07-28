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
import { createRequirement } from "@/app/(app)/training/actions";
import type { TrainingCategoryWithState, TrainingCourse } from "@/lib/training/types";

export function RequirementForm({
  courses,
  categories,
}: {
  courses: TrainingCourse[];
  categories: TrainingCategoryWithState[];
}) {
  const [state, action, pending] = useActionState(createRequirement, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add requirement</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3 md:grid-cols-2">
          {state.error ? (
            <p className="text-sm text-destructive md:col-span-2">{state.error}</p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-green-600 dark:text-green-400 md:col-span-2">
              {state.success}
            </p>
          ) : null}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="req_name">Name</Label>
            <Input id="req_name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="training_course_id">Course</Label>
            <select
              id="training_course_id"
              name="training_course_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="training_category_id">Category</Label>
            <select
              id="training_category_id"
              name="training_category_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignment_type">Assignment</Label>
            <select
              id="assignment_type"
              name="assignment_type"
              defaultValue="all_security"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all_security">All security</option>
              <option value="role">Role</option>
              <option value="campus">Campus</option>
              <option value="user">Individual</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="due_at">Due date</Label>
            <Input id="due_at" name="due_at" type="date" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              Create requirement
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

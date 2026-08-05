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
import { createExternalTraining } from "@/app/(app)/training/actions";
import type { TrainingCategoryWithState } from "@/lib/training/types";
import type { TeamMemberRow } from "@/lib/organization/team";

export function ExternalTrainingForm({
  categories,
  members,
  currentUserId,
}: {
  categories: TrainingCategoryWithState[];
  members: TeamMemberRow[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(createExternalTraining, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submit external training</CardTitle>
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
          <div className="space-y-2">
            <Label htmlFor="user_id">Team member</Label>
            <select
              id="user_id"
              name="user_id"
              defaultValue={currentUserId}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="course_name">Course / topic</Label>
            <Input id="course_name" name="course_name" required />
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
            <Label htmlFor="completion_date">Completion date</Label>
            <Input id="completion_date" name="completion_date" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider_name">Provider</Label>
            <Input id="provider_name" name="provider_name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="training_hours">Hours</Label>
            <Input id="training_hours" name="training_hours" type="number" step="0.25" min="0" />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              Submit for verification
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

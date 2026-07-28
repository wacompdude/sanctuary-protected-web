"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TRAINING_DELIVERY_METHOD_LABELS,
  TRAINING_EVENT_STATUS_LABELS,
} from "@/lib/training/constants";
import type { TrainingActionState, TrainingEvent } from "@/lib/training/types";

type CampusOption = { id: string; name: string };
type CourseOption = { id: string; name: string; training_category_id: string };
type CategoryOption = { id: string; name: string };

export function TrainingEventForm({
  action,
  campuses,
  courses,
  categories,
  initial,
  submitLabel = "Save event",
}: {
  action: (
    prev: TrainingActionState,
    formData: FormData,
  ) => Promise<TrainingActionState>;
  campuses: CampusOption[];
  courses: CourseOption[];
  categories: CategoryOption[];
  initial?: Partial<TrainingEvent>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          {state.success}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name">Event name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={initial?.name ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? "draft"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(TRAINING_EVENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="format">Format</Label>
          <select
            id="format"
            name="format"
            defaultValue={initial?.format ?? "in_person_classroom"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {Object.entries(TRAINING_DELIVERY_METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="training_category_id">Category</Label>
          <select
            id="training_category_id"
            name="training_category_id"
            defaultValue={initial?.training_category_id ?? ""}
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
          <Label htmlFor="training_course_id">Course</Label>
          <select
            id="training_course_id"
            name="training_course_id"
            defaultValue={initial?.training_course_id ?? ""}
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
          <Label htmlFor="campus_id">Campus</Label>
          <select
            id="campus_id"
            name="campus_id"
            defaultValue={initial?.campus_id ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Church-wide</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_at">Start</Label>
          <Input
            id="start_at"
            name="start_at"
            type="datetime-local"
            defaultValue={
              initial?.start_at ? initial.start_at.slice(0, 16) : undefined
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_at">End</Label>
          <Input
            id="end_at"
            name="end_at"
            type="datetime-local"
            defaultValue={
              initial?.end_at ? initial.end_at.slice(0, 16) : undefined
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            defaultValue={initial?.location ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructor_name">Instructor</Label>
          <Input
            id="instructor_name"
            name="instructor_name"
            defaultValue={initial?.instructor_name ?? ""}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={initial?.description ?? ""}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="required"
            value="true"
            defaultChecked={initial?.required}
          />
          Required training
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="creates_certification"
            value="true"
            defaultChecked={initial?.creates_certification}
          />
          Creates certification on completion
        </label>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="certification_type">Certification type</Label>
          <Input
            id="certification_type"
            name="certification_type"
            defaultValue={initial?.certification_type ?? ""}
            placeholder="e.g. CPR & First Aid"
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

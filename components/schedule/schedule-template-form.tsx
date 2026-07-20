"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  applyScheduleTemplateAction,
  createScheduleTemplateAction,
  updateScheduleTemplateAction,
} from "@/app/(app)/schedule/template-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SCHEDULE_EVENT_TYPES } from "@/lib/schedule/constants";
import type {
  CampusOption,
  ScheduleActionState,
  ScheduleTemplate,
} from "@/lib/schedule/types";

const initialState: ScheduleActionState = {};

const SAMPLE_SHIFTS = `[
  {
    "title": "Setup",
    "shift_type": "setup",
    "offset_minutes": -90,
    "duration_minutes": 90,
    "required_member_count": 2
  },
  {
    "title": "Main coverage",
    "shift_type": "security",
    "offset_minutes": 0,
    "duration_minutes": 150,
    "required_member_count": 4
  }
]`;

export function ScheduleTemplateForm({
  mode,
  campuses,
  template,
}: {
  mode: "create" | "edit";
  campuses: CampusOption[];
  template?: ScheduleTemplate | null;
}) {
  const action =
    mode === "edit" && template
      ? updateScheduleTemplateAction.bind(null, template.id)
      : createScheduleTemplateAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Template saved.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Template details</CardTitle>
          <CardDescription>
            Reusable event + shift blueprint for recurring services.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={200}
              defaultValue={template?.name ?? ""}
            />
            {state.fieldErrors?.name ? (
              <p className="text-sm text-destructive">{state.fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={template?.description ?? ""}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event_type">Event type</Label>
            <select
              id="event_type"
              name="event_type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={template?.event_type ?? "worship_service"}
            >
              {SCHEDULE_EVENT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="campus_id">Default campus</Label>
            <select
              id="campus_id"
              name="campus_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={template?.campus_id ?? ""}
            >
              <option value="">None</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_duration_minutes">
              Default event duration (minutes)
            </Label>
            <Input
              id="default_duration_minutes"
              name="default_duration_minutes"
              type="number"
              min={15}
              max={10080}
              defaultValue={template?.default_duration_minutes ?? 120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_location">Default location</Label>
            <Input
              id="default_location"
              name="default_location"
              maxLength={200}
              defaultValue={template?.default_location ?? ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={template?.is_active ?? true}
              className="h-4 w-4 rounded border"
            />
            Active template
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="default_shift_definitions">
              Shift definitions (JSON)
            </Label>
            <textarea
              id="default_shift_definitions"
              name="default_shift_definitions"
              rows={12}
              className="font-mono flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              defaultValue={
                template
                  ? JSON.stringify(
                      template.default_shift_definitions,
                      null,
                      2,
                    )
                  : SAMPLE_SHIFTS
              }
            />
            {state.fieldErrors?.default_shift_definitions ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.default_shift_definitions}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                offset_minutes is relative to the event start (negative = before).
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="h-11">
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Save template"
              : "Create template"}
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/schedule/templates">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export function ApplyScheduleTemplateForm({
  templates,
  campuses,
}: {
  templates: ScheduleTemplate[];
  campuses: CampusOption[];
}) {
  const [state, formAction, pending] = useActionState(
    applyScheduleTemplateAction,
    initialState,
  );

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No active templates yet. Create one to generate an event with shifts.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="template_id">Template</Label>
          <select
            id="template_id"
            name="template_id"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={templates[0]?.id}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="start_at">Event start</Label>
          <Input id="start_at" name="start_at" type="datetime-local" required />
          {state.fieldErrors?.start_at ? (
            <p className="text-sm text-destructive">
              {state.fieldErrors.start_at}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">Title override (optional)</Label>
          <Input id="title" name="title" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="campus_id">Campus override</Label>
          <select
            id="campus_id"
            name="campus_id"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="">Use template default</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "Creating…" : "Create event from template"}
      </Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createScheduleEventAction,
  updateScheduleEventAction,
} from "@/app/(app)/schedule/actions";
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
import {
  SCHEDULE_EVENT_STATUSES,
  SCHEDULE_EVENT_TYPES,
  SCHEDULE_RISK_LEVELS,
} from "@/lib/schedule/constants";
import { toChurchDateTimeLocalValue } from "@/lib/schedule/datetime";
import type {
  CampusOption,
  ScheduleActionState,
  ScheduleEvent,
} from "@/lib/schedule/types";

const initialState: ScheduleActionState = {};

type Props = {
  mode: "create" | "edit";
  campuses: CampusOption[];
  timeZone: string;
  event?: ScheduleEvent | null;
};

export function ScheduleEventForm({
  mode,
  campuses,
  timeZone,
  event,
}: Props) {
  const action =
    mode === "edit" && event
      ? updateScheduleEventAction.bind(null, event.id)
      : createScheduleEventAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [allDay, setAllDay] = useState(event?.all_day ?? false);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Basic information</CardTitle>
          <CardDescription>
            Title, type, status, and risk for this church security event.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              defaultValue={event?.title ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.title)}
            />
            {state.fieldErrors?.title ? (
              <p className="text-sm text-destructive">{state.fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_type">Event type</Label>
            <select
              id="event_type"
              name="event_type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={event?.event_type ?? "worship_service"}
            >
              {SCHEDULE_EVENT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={
                event?.status === "cancelled" || event?.status === "archived"
                  ? "scheduled"
                  : (event?.status ?? "scheduled")
              }
            >
              {SCHEDULE_EVENT_STATUSES.filter(
                (item) =>
                  item.value !== "cancelled" && item.value !== "archived",
              ).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="risk_level">Risk level</Label>
            <select
              id="risk_level"
              name="risk_level"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={event?.risk_level ?? "low"}
            >
              {SCHEDULE_RISK_LEVELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="campus_id">Campus</Label>
            <select
              id="campus_id"
              name="campus_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={event?.campus_id ?? ""}
            >
              <option value="">All / unspecified</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              maxLength={8000}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={event?.description ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Date and time</CardTitle>
          <CardDescription>
            Times are stored in UTC and shown using {timeZone}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="timezone" value={timeZone} />
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="all_day"
              name="all_day"
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <Label htmlFor="all_day">All-day event</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_at">Starts</Label>
            <Input
              id="start_at"
              name="start_at"
              type={allDay ? "date" : "datetime-local"}
              required
              defaultValue={
                allDay
                  ? toChurchDateTimeLocalValue(event?.start_at, timeZone).slice(
                      0,
                      10,
                    )
                  : toChurchDateTimeLocalValue(event?.start_at, timeZone)
              }
            />
            {state.fieldErrors?.start_at ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.start_at}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_at">Ends</Label>
            <Input
              id="end_at"
              name="end_at"
              type={allDay ? "date" : "datetime-local"}
              required
              defaultValue={
                allDay
                  ? toChurchDateTimeLocalValue(event?.end_at, timeZone).slice(
                      0,
                      10,
                    )
                  : toChurchDateTimeLocalValue(event?.end_at, timeZone)
              }
            />
            {state.fieldErrors?.end_at ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.end_at}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="recurrence_rule">
              Recurrence (optional RRULE)
            </Label>
            <Input
              id="recurrence_rule"
              name="recurrence_rule"
              placeholder="FREQ=WEEKLY;BYDAY=SU"
              defaultValue={event?.recurrence_rule ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Phase 3 supports storing weekly rules. Full series editing comes
              later. Include COUNT= or set an end date below.
            </p>
            {state.fieldErrors?.recurrence_rule ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.recurrence_rule}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="recurrence_end_at">Recurrence ends</Label>
            <Input
              id="recurrence_end_at"
              name="recurrence_end_at"
              type="date"
              defaultValue={
                event?.recurrence_end_at
                  ? toChurchDateTimeLocalValue(
                      event.recurrence_end_at,
                      timeZone,
                    ).slice(0, 10)
                  : ""
              }
            />
            {state.fieldErrors?.recurrence_end_at ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.recurrence_end_at}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location & security</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="location_name">Location</Label>
            <Input
              id="location_name"
              name="location_name"
              defaultValue={event?.location_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="building">Building</Label>
            <Input
              id="building"
              name="building"
              defaultValue={event?.building ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room">Room</Label>
            <Input id="room" name="room" defaultValue={event?.room ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="estimated_attendance">Estimated attendance</Label>
            <Input
              id="estimated_attendance"
              name="estimated_attendance"
              type="number"
              min={0}
              defaultValue={event?.estimated_attendance ?? ""}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="security_coverage_required"
              name="security_coverage_required"
              type="checkbox"
              className="h-4 w-4 rounded border"
              defaultChecked={event?.security_coverage_required ?? true}
            />
            <Label htmlFor="security_coverage_required">
              Security coverage required
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Save changes"
              : "Create event"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={
              event ? `/schedule/events/${event.id}` : "/schedule/events"
            }
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}

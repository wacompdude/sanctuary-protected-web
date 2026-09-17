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
  SCHEDULE_SHIFT_TYPES,
} from "@/lib/schedule/constants";
import { toChurchDateTimeLocalValue, syncEndLocalWithStartDate } from "@/lib/schedule/datetime";
import { WEEKLY_REPEAT_OPTIONS } from "@/lib/schedule/weekly-series";
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

function initialLocalValue(
  iso: string | null | undefined,
  timeZone: string,
  allDay: boolean,
): string {
  const full = toChurchDateTimeLocalValue(iso, timeZone);
  if (!full) return "";
  return allDay ? full.slice(0, 10) : full;
}

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
  const [startAt, setStartAt] = useState(() =>
    initialLocalValue(event?.start_at, timeZone, event?.all_day ?? false),
  );
  const [endAt, setEndAt] = useState(() =>
    initialLocalValue(event?.end_at, timeZone, event?.all_day ?? false),
  );
  const [repeatWeeks, setRepeatWeeks] = useState("1");
  const [createOpenShift, setCreateOpenShift] = useState(true);

  function handleAllDayChange(checked: boolean) {
    setAllDay(checked);
    if (checked) {
      setStartAt((current) => (current ? current.slice(0, 10) : current));
      setEndAt((current) => (current ? current.slice(0, 10) : current));
      return;
    }
    setStartAt((current) =>
      current && current.length === 10 ? `${current}T09:00` : current,
    );
    setEndAt((current) =>
      current && current.length === 10 ? `${current}T11:00` : current,
    );
  }

  function handleStartChange(nextStart: string) {
    const previousStart = startAt;
    setStartAt(nextStart);

    const previousDate = previousStart.slice(0, 10);
    const nextDate = nextStart.slice(0, 10);
    const dateChanged = Boolean(nextDate) && previousDate !== nextDate;

    // Only move the end when the calendar date changes (or end is still empty).
    if (!dateChanged && endAt) return;

    setEndAt((currentEnd) =>
      syncEndLocalWithStartDate({
        startLocal: nextStart,
        endLocal: currentEnd,
        previousStartLocal: previousStart,
        allDay,
      }),
    );
  }

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
              <option value="">None</option>
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
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={event?.description ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>When</CardTitle>
          <CardDescription>Timezone: {timeZone}</CardDescription>
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
              onChange={(e) => handleAllDayChange(e.target.checked)}
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
              value={startAt}
              onChange={(e) => handleStartChange(e.target.value)}
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
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
            {state.fieldErrors?.end_at ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.end_at}
              </p>
            ) : null}
          </div>

          {mode === "create" ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="repeat_weeks">Repeat weekly</Label>
                <select
                  id="repeat_weeks"
                  name="repeat_weeks"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={repeatWeeks}
                  onChange={(e) => setRepeatWeeks(e.target.value)}
                >
                  {WEEKLY_REPEAT_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Creates a separate event each week so you can assign security
                  for each service.
                </p>
                {state.fieldErrors?.repeat_weeks ? (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.repeat_weeks}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  id="create_open_shift"
                  name="create_open_shift"
                  type="checkbox"
                  className="h-4 w-4 rounded border"
                  checked={createOpenShift}
                  onChange={(e) => setCreateOpenShift(e.target.checked)}
                />
                <Label htmlFor="create_open_shift">
                  Create open shift each week
                </Label>
              </div>
              {createOpenShift ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="series_shift_type">Shift type</Label>
                    <select
                      id="series_shift_type"
                      name="series_shift_type"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      defaultValue="security"
                    >
                      {SCHEDULE_SHIFT_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="series_required_member_count">
                      Required people per shift
                    </Label>
                    <Input
                      id="series_required_member_count"
                      name="series_required_member_count"
                      type="number"
                      min={0}
                      max={500}
                      defaultValue={2}
                    />
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
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
            </>
          )}
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
              : Number(repeatWeeks) > 1
                ? `Create ${repeatWeeks}-week series`
                : createOpenShift
                  ? "Create event + shift"
                  : "Create event"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={event ? `/schedule/events/${event.id}` : "/schedule/events"}
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}

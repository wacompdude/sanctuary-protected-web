"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createScheduleShiftAction,
  updateScheduleShiftAction,
} from "@/app/(app)/schedule/shift-actions";
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
import { toChurchDateTimeLocalValue } from "@/lib/schedule/datetime";
import {
  SCHEDULE_PRIORITIES,
  SCHEDULE_SHIFT_TYPES,
} from "@/lib/schedule/constants";
import type {
  CampusOption,
  ScheduleActionState,
  ScheduleShift,
} from "@/lib/schedule/types";

const initialState: ScheduleActionState = {};

type Props = {
  mode: "create" | "edit";
  campuses: CampusOption[];
  events: Array<{ id: string; title: string; start_at: string }>;
  timeZone: string;
  shift?: ScheduleShift | null;
  defaultEventId?: string | null;
};

export function ScheduleShiftForm({
  mode,
  campuses,
  events,
  timeZone,
  shift,
  defaultEventId,
}: Props) {
  const action =
    mode === "edit" && shift
      ? updateScheduleShiftAction.bind(null, shift.id)
      : createScheduleShiftAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [outside, setOutside] = useState(
    shift?.allow_outside_event_window ?? false,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Shift details</CardTitle>
          <CardDescription>
            Coverage window for security or related roles.
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
              defaultValue={shift?.title ?? ""}
            />
            {state.fieldErrors?.title ? (
              <p className="text-sm text-destructive">{state.fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift_type">Shift type</Label>
            <select
              id="shift_type"
              name="shift_type"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={shift?.shift_type ?? "security"}
            >
              {SCHEDULE_SHIFT_TYPES.map((item) => (
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
                shift?.status === "partially_staffed" ||
                shift?.status === "fully_staffed"
                  ? "open"
                  : (shift?.status ?? "open")
              }
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_progress">In progress</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <select
              id="priority"
              name="priority"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={shift?.priority ?? "normal"}
            >
              {SCHEDULE_PRIORITIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_id">Related event</Label>
            <select
              id="event_id"
              name="event_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={shift?.event_id ?? defaultEventId ?? ""}
            >
              <option value="">Standalone shift</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
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
              defaultValue={shift?.description ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Date and time</CardTitle>
          <CardDescription>Timezone: {timeZone}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="timezone" value={timeZone} />
          <div className="space-y-2">
            <Label htmlFor="start_at">Starts</Label>
            <Input
              id="start_at"
              name="start_at"
              type="datetime-local"
              required
              defaultValue={toChurchDateTimeLocalValue(shift?.start_at, timeZone)}
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
              type="datetime-local"
              required
              defaultValue={toChurchDateTimeLocalValue(shift?.end_at, timeZone)}
            />
            {state.fieldErrors?.end_at ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.end_at}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="allow_outside_event_window"
              name="allow_outside_event_window"
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={outside}
              onChange={(e) => setOutside(e.target.checked)}
            />
            <Label htmlFor="allow_outside_event_window">
              Allow times outside the related event window
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Staffing requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="required_member_count">Required members</Label>
            <Input
              id="required_member_count"
              name="required_member_count"
              type="number"
              min={0}
              max={500}
              defaultValue={shift?.required_member_count ?? 1}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minimum_certified_member_count">
              Minimum certified
            </Label>
            <Input
              id="minimum_certified_member_count"
              name="minimum_certified_member_count"
              type="number"
              min={0}
              max={500}
              defaultValue={shift?.minimum_certified_member_count ?? 0}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="required_certifications">
              Required certifications (comma-separated)
            </Label>
            <Input
              id="required_certifications"
              name="required_certifications"
              placeholder="CPR, First Aid"
              defaultValue={(shift?.required_certifications ?? []).join(", ")}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="lead_member_required"
              name="lead_member_required"
              type="checkbox"
              className="h-4 w-4 rounded border"
              defaultChecked={shift?.lead_member_required ?? false}
            />
            <Label htmlFor="lead_member_required">Team lead required</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="campus_id">Campus</Label>
            <select
              id="campus_id"
              name="campus_id"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={shift?.campus_id ?? ""}
            >
              <option value="">Unspecified</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location_name">Location</Label>
            <Input
              id="location_name"
              name="location_name"
              defaultValue={shift?.location_name ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="building">Building</Label>
            <Input
              id="building"
              name="building"
              defaultValue={shift?.building ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room">Room</Label>
            <Input id="room" name="room" defaultValue={shift?.room ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Internal notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={shift?.notes ?? ""}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Save shift"
              : "Create shift"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={shift ? `/schedule/shifts/${shift.id}` : "/schedule/shifts"}
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}

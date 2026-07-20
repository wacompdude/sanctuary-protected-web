"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createUnavailabilityAction,
  updateUnavailabilityAction,
} from "@/app/(app)/schedule/availability-actions";
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
import { SCHEDULE_UNAVAILABILITY_REASONS } from "@/lib/schedule/constants";
import type {
  MemberUnavailability,
  ScheduleActionState,
} from "@/lib/schedule/types";

const initialState: ScheduleActionState = {};

type MemberOption = {
  membershipId: string;
  name: string;
};

type Props = {
  mode: "create" | "edit";
  timeZone: string;
  record?: MemberUnavailability | null;
  canManageOthers?: boolean;
  members?: MemberOption[];
};

export function UnavailabilityForm({
  mode,
  timeZone,
  record,
  canManageOthers = false,
  members = [],
}: Props) {
  const action =
    mode === "edit" && record
      ? updateUnavailabilityAction.bind(null, record.id)
      : createUnavailabilityAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [allDay, setAllDay] = useState(record?.all_day ?? false);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Unavailable period</CardTitle>
          <CardDescription>
            Times are shown using {timeZone}. Private notes stay private.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="timezone" value={timeZone} />

          {canManageOthers && mode === "create" ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="membership_id">Member</Label>
              <select
                id="membership_id"
                name="membership_id"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="">Myself</option>
                {members.map((member) => (
                  <option key={member.membershipId} value={member.membershipId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">Label (optional)</Label>
            <Input
              id="title"
              name="title"
              maxLength={200}
              placeholder="Out of town"
              defaultValue={record?.title ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason_category">Reason category</Label>
            <select
              id="reason_category"
              name="reason_category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={record?.reason_category ?? "personal"}
            >
              {SCHEDULE_UNAVAILABILITY_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Schedulers see the category, not private details.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end pb-2">
            <input
              id="all_day"
              name="all_day"
              type="checkbox"
              className="h-4 w-4 rounded border"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            <Label htmlFor="all_day">All day</Label>
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
                  ? toChurchDateTimeLocalValue(record?.start_at, timeZone).slice(
                      0,
                      10,
                    )
                  : toChurchDateTimeLocalValue(record?.start_at, timeZone)
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
                  ? toChurchDateTimeLocalValue(record?.end_at, timeZone).slice(
                      0,
                      10,
                    )
                  : toChurchDateTimeLocalValue(record?.end_at, timeZone)
              }
            />
            {state.fieldErrors?.end_at ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.end_at}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="recurrence_rule">Repeat (optional RRULE)</Label>
            <Input
              id="recurrence_rule"
              name="recurrence_rule"
              placeholder="FREQ=WEEKLY;BYDAY=TU"
              defaultValue={record?.recurrence_rule ?? ""}
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
                record?.recurrence_end_at
                  ? toChurchDateTimeLocalValue(
                      record.recurrence_end_at,
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

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Private notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              maxLength={2000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              defaultValue={record?.notes ?? ""}
              placeholder="Only you (and managers editing for you) can see this"
            />
            <p className="text-xs text-muted-foreground">
              Do not include sensitive medical details you are not comfortable
              sharing.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "edit"
              ? "Save changes"
              : "Add unavailable time"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/schedule/availability">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

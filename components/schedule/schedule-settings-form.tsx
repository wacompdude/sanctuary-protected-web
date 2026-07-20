"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateScheduleSettingsAction } from "@/app/(app)/settings/scheduling/actions";
import {
  LabeledCheckbox,
  LabeledInput,
  LabeledSelect,
} from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChurchScheduleSettings, ScheduleActionState } from "@/lib/schedule/types";

const initialState: ScheduleActionState = {};

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
] as const;

const VIEW_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
] as const;

function timeForInput(value: string | null | undefined): string {
  if (!value) return "18:00";
  return value.slice(0, 5);
}

export function ScheduleSettingsForm({
  settings,
  canEdit,
}: {
  settings: ChurchScheduleSettings;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    updateScheduleSettingsAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.refresh();
  }, [state.success, router]);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Scheduling settings saved.
        </p>
      ) : null}

      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Calendar preferences</CardTitle>
            <CardDescription>
              Defaults for calendar display and new event/shift durations.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LabeledSelect
              id="default_calendar_view"
              name="default_calendar_view"
              label="Default calendar view"
              defaultValue={settings.default_calendar_view}
              options={VIEW_OPTIONS}
              error={state.fieldErrors?.default_calendar_view}
            />
            <LabeledSelect
              id="week_starts_on"
              name="week_starts_on"
              label="Week starts on"
              defaultValue={String(settings.week_starts_on)}
              options={WEEKDAY_OPTIONS}
              error={state.fieldErrors?.week_starts_on}
            />
            <LabeledInput
              id="timezone"
              name="timezone"
              label="Schedule timezone"
              defaultValue={settings.timezone}
              error={state.fieldErrors?.timezone}
              hint="IANA timezone, e.g. America/Los_Angeles"
            />
            <LabeledInput
              id="default_event_duration_minutes"
              name="default_event_duration_minutes"
              label="Default event duration (minutes)"
              type="number"
              defaultValue={settings.default_event_duration_minutes}
              error={state.fieldErrors?.default_event_duration_minutes}
            />
            <LabeledInput
              id="default_shift_duration_minutes"
              name="default_shift_duration_minutes"
              label="Default shift duration (minutes)"
              type="number"
              defaultValue={settings.default_shift_duration_minutes}
              error={state.fieldErrors?.default_shift_duration_minutes}
            />
            <LabeledCheckbox
              id="display_unavailable_periods"
              name="display_unavailable_periods"
              label="Show unavailable periods on calendar"
              defaultChecked={settings.display_unavailable_periods}
            />
            <LabeledCheckbox
              id="display_training_events"
              name="display_training_events"
              label="Show training events"
              defaultChecked={settings.display_training_events}
            />
            <LabeledCheckbox
              id="display_maintenance_events"
              name="display_maintenance_events"
              label="Show maintenance events"
              defaultChecked={settings.display_maintenance_events}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assignment & conflict rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LabeledCheckbox
              id="require_assignment_confirmation"
              name="require_assignment_confirmation"
              label="Require assignment confirmation"
              defaultChecked={settings.require_assignment_confirmation}
            />
            <LabeledCheckbox
              id="prevent_assignment_during_unavailability"
              name="prevent_assignment_during_unavailability"
              label="Block assignments during unavailability"
              defaultChecked={settings.prevent_assignment_during_unavailability}
            />
            <LabeledCheckbox
              id="allow_conflict_override"
              name="allow_conflict_override"
              label="Allow conflict override"
              defaultChecked={settings.allow_conflict_override}
            />
            <LabeledCheckbox
              id="require_override_reason"
              name="require_override_reason"
              label="Require override reason"
              defaultChecked={settings.require_override_reason}
            />
            <LabeledCheckbox
              id="enforce_certification_requirements"
              name="enforce_certification_requirements"
              label="Enforce certification requirements"
              defaultChecked={settings.enforce_certification_requirements}
              hint="Stored for enforcement in a later release."
            />
            <LabeledCheckbox
              id="minimum_staffing_warning_enabled"
              name="minimum_staffing_warning_enabled"
              label="Warn when shifts are understaffed"
              defaultChecked={settings.minimum_staffing_warning_enabled}
            />
            <LabeledInput
              id="minimum_rest_minutes"
              name="minimum_rest_minutes"
              label="Minimum rest between shifts (minutes)"
              type="number"
              defaultValue={settings.minimum_rest_minutes}
              error={state.fieldErrors?.minimum_rest_minutes}
              hint="Optional. Not enforced in v1."
            />
            <LabeledInput
              id="maximum_weekly_hours"
              name="maximum_weekly_hours"
              label="Maximum weekly hours"
              type="number"
              defaultValue={settings.maximum_weekly_hours}
              error={state.fieldErrors?.maximum_weekly_hours}
              hint="Optional. Not enforced in v1."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification defaults</CardTitle>
            <CardDescription>
              Reminder windows used by the hourly schedule scan cron.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LabeledCheckbox
              id="assignment_invitation_email_enabled"
              name="assignment_invitation_email_enabled"
              label="Assignment invitation emails"
              defaultChecked={settings.assignment_invitation_email_enabled}
            />
            <LabeledCheckbox
              id="assignment_confirmation_email_enabled"
              name="assignment_confirmation_email_enabled"
              label="Assignment response emails to schedulers"
              defaultChecked={settings.assignment_confirmation_email_enabled}
            />
            <LabeledCheckbox
              id="assignment_change_email_enabled"
              name="assignment_change_email_enabled"
              label="Assignment change emails"
              defaultChecked={settings.assignment_change_email_enabled}
            />
            <LabeledCheckbox
              id="assignment_cancellation_email_enabled"
              name="assignment_cancellation_email_enabled"
              label="Cancellation emails"
              defaultChecked={settings.assignment_cancellation_email_enabled}
            />
            <LabeledInput
              id="default_first_reminder_minutes"
              name="default_first_reminder_minutes"
              label="First reminder (minutes before)"
              type="number"
              defaultValue={settings.default_first_reminder_minutes}
              error={state.fieldErrors?.default_first_reminder_minutes}
              hint="Default 1440 = 24 hours"
            />
            <LabeledInput
              id="default_second_reminder_minutes"
              name="default_second_reminder_minutes"
              label="Second reminder (minutes before)"
              type="number"
              defaultValue={settings.default_second_reminder_minutes}
              error={state.fieldErrors?.default_second_reminder_minutes}
              hint="Default 120 = 2 hours"
            />
            <LabeledInput
              id="unfilled_shift_warning_minutes"
              name="unfilled_shift_warning_minutes"
              label="Unfilled-shift warning (minutes before)"
              type="number"
              defaultValue={settings.unfilled_shift_warning_minutes}
              error={state.fieldErrors?.unfilled_shift_warning_minutes}
              hint="Default 2880 = 48 hours"
            />
            <LabeledCheckbox
              id="schedule_digest_enabled"
              name="schedule_digest_enabled"
              label="Enable weekly schedule digest"
              defaultChecked={settings.schedule_digest_enabled}
              hint="Digest delivery is prepared for a later release."
            />
            <LabeledSelect
              id="schedule_digest_day"
              name="schedule_digest_day"
              label="Digest day"
              defaultValue={String(settings.schedule_digest_day)}
              options={WEEKDAY_OPTIONS}
              error={state.fieldErrors?.schedule_digest_day}
            />
            <LabeledInput
              id="schedule_digest_time"
              name="schedule_digest_time"
              label="Digest time"
              type="time"
              defaultValue={timeForInput(settings.schedule_digest_time)}
              error={state.fieldErrors?.schedule_digest_time}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member permissions</CardTitle>
            <CardDescription>
              Role-based self-service controls for security team members.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <LabeledCheckbox
              id="members_may_create_unavailability"
              name="members_may_create_unavailability"
              label="Members may create unavailability"
              defaultChecked={settings.members_may_create_unavailability}
            />
            <LabeledCheckbox
              id="members_may_edit_future_unavailability"
              name="members_may_edit_future_unavailability"
              label="Members may edit future unavailability"
              defaultChecked={settings.members_may_edit_future_unavailability}
            />
            <LabeledCheckbox
              id="members_may_decline_assignments"
              name="members_may_decline_assignments"
              label="Members may decline assignments"
              defaultChecked={settings.members_may_decline_assignments}
            />
            <LabeledCheckbox
              id="decline_reason_required"
              name="decline_reason_required"
              label="Require a decline reason"
              defaultChecked={settings.decline_reason_required}
            />
            <LabeledCheckbox
              id="members_may_view_team_schedule"
              name="members_may_view_team_schedule"
              label="Members may view team schedule"
              defaultChecked={settings.members_may_view_team_schedule}
            />
            <LabeledCheckbox
              id="members_may_volunteer_open_shifts"
              name="members_may_volunteer_open_shifts"
              label="Members may volunteer for open shifts"
              defaultChecked={settings.members_may_volunteer_open_shifts}
              hint="Volunteer flow is reserved for a later release."
            />
          </CardContent>
        </Card>
      </fieldset>

      {canEdit ? (
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Saving…" : "Save scheduling settings"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          View only. Administrators and owners can edit these settings.
        </p>
      )}
    </form>
  );
}

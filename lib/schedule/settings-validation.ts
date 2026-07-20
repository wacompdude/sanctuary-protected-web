import type {
  ChurchScheduleSettings,
  ScheduleActionState,
  ScheduleCalendarView,
} from "@/lib/schedule/types";

function checkbox(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function intField(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): { value?: number; error?: string } {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return { error: "Required." };
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { error: "Enter a whole number." };
  }
  if (value < min || value > max) {
    return { error: `Must be between ${min} and ${max}.` };
  }
  return { value };
}

function optionalIntField(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): { value: number | null; error?: string } {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { value: null, error: "Enter a whole number." };
  }
  if (value < min || value > max) {
    return { value: null, error: `Must be between ${min} and ${max}.` };
  }
  return { value };
}

function optionalNumberField(
  formData: FormData,
  key: string,
  min: number,
  max: number,
): { value: number | null; error?: string } {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return { value: null };
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { value: null, error: "Enter a number." };
  }
  if (value < min || value > max) {
    return { value: null, error: `Must be between ${min} and ${max}.` };
  }
  return { value };
}

const CALENDAR_VIEWS: ScheduleCalendarView[] = [
  "month",
  "week",
  "day",
  "agenda",
];

export type ScheduleSettingsFormInput = Omit<
  ChurchScheduleSettings,
  "id" | "church_id" | "created_at" | "updated_at" | "updated_by"
>;

export function validateScheduleSettingsForm(
  formData: FormData,
): ScheduleActionState & { data?: ScheduleSettingsFormInput } {
  const fieldErrors: Record<string, string> = {};

  const viewRaw = String(formData.get("default_calendar_view") ?? "month").trim();
  if (!CALENDAR_VIEWS.includes(viewRaw as ScheduleCalendarView)) {
    fieldErrors.default_calendar_view = "Select a valid calendar view.";
  }

  const weekStarts = intField(formData, "week_starts_on", 0, 6);
  if (weekStarts.error) fieldErrors.week_starts_on = weekStarts.error;

  const eventDuration = intField(
    formData,
    "default_event_duration_minutes",
    15,
    10080,
  );
  if (eventDuration.error) {
    fieldErrors.default_event_duration_minutes = eventDuration.error;
  }

  const shiftDuration = intField(
    formData,
    "default_shift_duration_minutes",
    15,
    10080,
  );
  if (shiftDuration.error) {
    fieldErrors.default_shift_duration_minutes = shiftDuration.error;
  }

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || timezone.length > 64) {
    fieldErrors.timezone = "Enter a valid timezone.";
  }

  const firstReminder = intField(
    formData,
    "default_first_reminder_minutes",
    0,
    10080,
  );
  if (firstReminder.error) {
    fieldErrors.default_first_reminder_minutes = firstReminder.error;
  }

  const secondReminder = intField(
    formData,
    "default_second_reminder_minutes",
    0,
    10080,
  );
  if (secondReminder.error) {
    fieldErrors.default_second_reminder_minutes = secondReminder.error;
  }

  const unfilled = intField(formData, "unfilled_shift_warning_minutes", 0, 20160);
  if (unfilled.error) {
    fieldErrors.unfilled_shift_warning_minutes = unfilled.error;
  }

  const digestDay = intField(formData, "schedule_digest_day", 0, 6);
  if (digestDay.error) fieldErrors.schedule_digest_day = digestDay.error;

  const digestTime = String(formData.get("schedule_digest_time") ?? "18:00").trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(digestTime)) {
    fieldErrors.schedule_digest_time = "Use HH:MM format.";
  }

  const rest = optionalIntField(formData, "minimum_rest_minutes", 0, 10080);
  if (rest.error) fieldErrors.minimum_rest_minutes = rest.error;

  const maxHours = optionalNumberField(formData, "maximum_weekly_hours", 1, 168);
  if (maxHours.error) fieldErrors.maximum_weekly_hours = maxHours.error;

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  return {
    data: {
      default_calendar_view: viewRaw as ScheduleCalendarView,
      week_starts_on: weekStarts.value!,
      default_event_duration_minutes: eventDuration.value!,
      default_shift_duration_minutes: shiftDuration.value!,
      timezone,
      display_unavailable_periods: checkbox(
        formData,
        "display_unavailable_periods",
      ),
      display_training_events: checkbox(formData, "display_training_events"),
      display_maintenance_events: checkbox(
        formData,
        "display_maintenance_events",
      ),
      require_assignment_confirmation: checkbox(
        formData,
        "require_assignment_confirmation",
      ),
      prevent_assignment_during_unavailability: checkbox(
        formData,
        "prevent_assignment_during_unavailability",
      ),
      allow_conflict_override: checkbox(formData, "allow_conflict_override"),
      require_override_reason: checkbox(formData, "require_override_reason"),
      enforce_certification_requirements: checkbox(
        formData,
        "enforce_certification_requirements",
      ),
      minimum_staffing_warning_enabled: checkbox(
        formData,
        "minimum_staffing_warning_enabled",
      ),
      minimum_rest_minutes: rest.value,
      maximum_weekly_hours: maxHours.value,
      assignment_invitation_email_enabled: checkbox(
        formData,
        "assignment_invitation_email_enabled",
      ),
      assignment_confirmation_email_enabled: checkbox(
        formData,
        "assignment_confirmation_email_enabled",
      ),
      assignment_change_email_enabled: checkbox(
        formData,
        "assignment_change_email_enabled",
      ),
      assignment_cancellation_email_enabled: checkbox(
        formData,
        "assignment_cancellation_email_enabled",
      ),
      default_first_reminder_minutes: firstReminder.value!,
      default_second_reminder_minutes: secondReminder.value!,
      unfilled_shift_warning_minutes: unfilled.value!,
      schedule_digest_enabled: checkbox(formData, "schedule_digest_enabled"),
      schedule_digest_day: digestDay.value!,
      schedule_digest_time: digestTime.length === 5 ? `${digestTime}:00` : digestTime,
      members_may_create_unavailability: checkbox(
        formData,
        "members_may_create_unavailability",
      ),
      members_may_edit_future_unavailability: checkbox(
        formData,
        "members_may_edit_future_unavailability",
      ),
      members_may_decline_assignments: checkbox(
        formData,
        "members_may_decline_assignments",
      ),
      decline_reason_required: checkbox(formData, "decline_reason_required"),
      members_may_view_team_schedule: checkbox(
        formData,
        "members_may_view_team_schedule",
      ),
      members_may_volunteer_open_shifts: checkbox(
        formData,
        "members_may_volunteer_open_shifts",
      ),
    },
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleEventFormInput } from "@/lib/schedule/validation";
import type { ScheduleShiftFormInput } from "@/lib/schedule/shift-validation";

export const WEEKLY_REPEAT_OPTIONS = [
  { value: 1, label: "Once (no repeat)" },
  { value: 2, label: "2 weeks" },
  { value: 4, label: "4 weeks" },
  { value: 6, label: "6 weeks" },
  { value: 8, label: "8 weeks" },
  { value: 12, label: "12 weeks" },
  { value: 26, label: "26 weeks" },
] as const;

function addWeeks(iso: string, weeks: number): string {
  const date = new Date(iso);
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString();
}

export function parseRepeatWeeks(formData: FormData): number {
  const raw = String(formData.get("repeat_weeks") ?? "1").trim();
  const weeks = Number(raw);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return 1;
  return weeks;
}

export function parseCreateOpenShift(formData: FormData): boolean {
  const value = formData.get("create_open_shift");
  return value === "on" || value === "true" || value === "1";
}

export function parseCreateMatchingEvents(formData: FormData): boolean {
  const value = formData.get("create_matching_events");
  return value === "on" || value === "true" || value === "1";
}

export async function materializeWeeklyEventSeries(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  event: ScheduleEventFormInput;
  weeks: number;
  createOpenShift: boolean;
  shiftType?: string;
  requiredMemberCount?: number;
}): Promise<{
  firstEventId: string | null;
  firstShiftId: string | null;
  createdEvents: number;
  createdShifts: number;
  errorMessage: string | null;
}> {
  const weeks = input.weeks;
  if (weeks < 1 || weeks > 52) {
    return {
      firstEventId: null,
      firstShiftId: null,
      createdEvents: 0,
      createdShifts: 0,
      errorMessage: "Choose between 1 and 52 weeks.",
    };
  }

  const requiredMemberCount = input.requiredMemberCount ?? 2;
  if (
    input.createOpenShift &&
    (!Number.isInteger(requiredMemberCount) ||
      requiredMemberCount < 0 ||
      requiredMemberCount > 500)
  ) {
    return {
      firstEventId: null,
      firstShiftId: null,
      createdEvents: 0,
      createdShifts: 0,
      errorMessage: "Enter a valid required member count for weekly shifts.",
    };
  }

  const recurrenceRule = weeks > 1 ? `FREQ=WEEKLY;COUNT=${weeks}` : null;
  const recurrenceEndAt =
    weeks > 1 ? addWeeks(input.event.start_at, weeks - 1) : null;

  let parentEventId: string | null = null;
  let firstEventId: string | null = null;
  let firstShiftId: string | null = null;
  let createdEvents = 0;
  let createdShifts = 0;

  for (let week = 0; week < weeks; week += 1) {
    const startAt = addWeeks(input.event.start_at, week);
    const endAt = addWeeks(input.event.end_at, week);

    const eventPayload = {
      organization_id: input.organizationId,
      title: input.event.title,
      description: input.event.description,
      event_type: input.event.event_type,
      status: input.event.status,
      campus_id: input.event.campus_id,
      location_name: input.event.location_name,
      building: input.event.building,
      room: input.event.room,
      start_at: startAt,
      end_at: endAt,
      all_day: input.event.all_day,
      timezone: input.event.timezone,
      recurrence_rule: week === 0 ? recurrenceRule : null,
      recurrence_end_at: week === 0 ? recurrenceEndAt : null,
      parent_event_id: week === 0 ? null : parentEventId,
      security_coverage_required: input.event.security_coverage_required,
      estimated_attendance: input.event.estimated_attendance,
      risk_level: input.event.risk_level,
      created_by: input.userId,
      updated_by: input.userId,
    };

    const { data: createdEvent, error: eventError } = await input.supabase
      .from("schedule_events")
      .insert(eventPayload)
      .select("id")
      .single();

    if (eventError || !createdEvent) {
      return {
        firstEventId,
        firstShiftId,
        createdEvents,
        createdShifts,
        errorMessage:
          eventError?.message ??
          `Created ${createdEvents} event(s), then failed on week ${week + 1}.`,
      };
    }

    const eventId: string = String(createdEvent.id);
    if (week === 0) {
      parentEventId = eventId;
      firstEventId = eventId;
    }
    createdEvents += 1;

    if (!input.createOpenShift) continue;

    const { data: shift, error: shiftError } = await input.supabase
      .from("schedule_shifts")
      .insert({
        organization_id: input.organizationId,
        event_id: eventId,
        title: input.event.title,
        description: input.event.description,
        shift_type: input.shiftType ?? "security",
        status: "open",
        priority: "normal",
        start_at: startAt,
        end_at: endAt,
        timezone: input.event.timezone,
        location_name: input.event.location_name,
        campus_id: input.event.campus_id,
        required_member_count: requiredMemberCount,
        minimum_certified_member_count: 0,
        required_certifications: [],
        lead_member_required: false,
        allow_outside_event_window: true,
        notes: null,
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("id")
      .single();

    if (shiftError || !shift) {
      return {
        firstEventId,
        firstShiftId,
        createdEvents,
        createdShifts,
        errorMessage:
          shiftError?.message ??
          `Events created, but shifts failed on week ${week + 1}.`,
      };
    }

    if (week === 0) firstShiftId = String(shift.id);
    createdShifts += 1;
  }

  return {
    firstEventId,
    firstShiftId,
    createdEvents,
    createdShifts,
    errorMessage: null,
  };
}

export async function materializeWeeklyShifts(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  shift: ScheduleShiftFormInput;
  weeks: number;
  createMatchingEvents: boolean;
}): Promise<{
  firstEventId: string | null;
  firstShiftId: string | null;
  createdEvents: number;
  createdShifts: number;
  errorMessage: string | null;
}> {
  const weeks = input.weeks;
  if (weeks < 1 || weeks > 52) {
    return {
      firstEventId: null,
      firstShiftId: null,
      createdEvents: 0,
      createdShifts: 0,
      errorMessage: "Choose between 1 and 52 weeks.",
    };
  }

  if (input.shift.event_id && weeks > 1) {
    return {
      firstEventId: null,
      firstShiftId: null,
      createdEvents: 0,
      createdShifts: 0,
      errorMessage:
        "Weekly series cannot be linked to one existing event. Leave Related event blank, or create a weekly event series instead.",
    };
  }

  if (weeks > 1 && input.createMatchingEvents && !input.shift.event_id) {
    return materializeWeeklyEventSeries({
      supabase: input.supabase,
      organizationId: input.organizationId,
      userId: input.userId,
      weeks,
      createOpenShift: true,
      shiftType: input.shift.shift_type,
      requiredMemberCount: input.shift.required_member_count,
      event: {
        title: input.shift.title,
        description: input.shift.description,
        event_type: "worship_service",
        status: "scheduled",
        campus_id: input.shift.campus_id,
        location_name: input.shift.location_name,
        building: input.shift.building,
        room: input.shift.room,
        start_at: input.shift.start_at,
        end_at: input.shift.end_at,
        all_day: false,
        timezone: input.shift.timezone,
        recurrence_rule: null,
        recurrence_end_at: null,
        security_coverage_required: true,
        estimated_attendance: null,
        risk_level: "low",
      },
    });
  }

  let firstShiftId: string | null = null;
  let createdShifts = 0;

  for (let week = 0; week < weeks; week += 1) {
    const { data, error } = await input.supabase
      .from("schedule_shifts")
      .insert({
        organization_id: input.organizationId,
        ...input.shift,
        start_at: addWeeks(input.shift.start_at, week),
        end_at: addWeeks(input.shift.end_at, week),
        created_by: input.userId,
        updated_by: input.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        firstEventId: null,
        firstShiftId,
        createdEvents: 0,
        createdShifts,
        errorMessage:
          error?.message ??
          `Created ${createdShifts} shift(s), then failed on week ${week + 1}.`,
      };
    }
    if (week === 0) firstShiftId = String(data.id);
    createdShifts += 1;
  }

  return {
    firstEventId: null,
    firstShiftId,
    createdEvents: 0,
    createdShifts,
    errorMessage: null,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  CONFIRMED_STAFFING_STATUSES,
} from "@/lib/schedule/constants";
import type {
  ScheduleConflict,
  ScheduleShift,
} from "@/lib/schedule/types";

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime();
}

export type ValidateAssignmentInput = {
  churchId: string;
  shift: ScheduleShift;
  membershipId: string;
  userId: string;
  membershipStatus: string;
  membershipCampusId?: string | null;
  allowOverride: boolean;
  settings?: {
    prevent_assignment_during_unavailability?: boolean;
    allow_conflict_override?: boolean;
    enforce_certification_requirements?: boolean;
  } | null;
};

/**
 * Central conflict checks for assigning a member to a shift.
 * Call from server actions before insert.
 */
export async function validateShiftAssignment(
  supabase: SupabaseClient,
  input: ValidateAssignmentInput,
): Promise<ScheduleConflict[]> {
  const conflicts: ScheduleConflict[] = [];
  const { shift, settings } = input;
  const preventUnavailable =
    settings?.prevent_assignment_during_unavailability !== false;
  const allowOverride =
    input.allowOverride && settings?.allow_conflict_override !== false;

  if (shift.status === "cancelled") {
    conflicts.push({
      conflict_type: "shift_cancelled",
      severity: "blocker",
      message: "This shift is cancelled and cannot receive new assignments.",
      related_record_id: shift.id,
      override_allowed: false,
    });
    return conflicts;
  }

  if (input.membershipStatus !== "active") {
    conflicts.push({
      conflict_type: "inactive_membership",
      severity: "blocker",
      message: "Only active church members can be assigned.",
      related_record_id: input.membershipId,
      override_allowed: false,
    });
    return conflicts;
  }

  if (shift.event_id) {
    const { data: event } = await supabase
      .from("schedule_events")
      .select("id, status")
      .eq("id", shift.event_id)
      .eq("church_id", input.churchId)
      .maybeSingle();

    if (event?.status === "cancelled" || event?.status === "archived") {
      conflicts.push({
        conflict_type: "event_cancelled",
        severity: "blocker",
        message: "The related event is cancelled.",
        related_record_id: shift.event_id,
        override_allowed: false,
      });
    }
  }

  if (
    shift.campus_id &&
    input.membershipCampusId &&
    shift.campus_id !== input.membershipCampusId
  ) {
    conflicts.push({
      conflict_type: "campus_restriction",
      severity: "warning",
      message: "Member is typically associated with a different campus.",
      related_record_id: input.membershipCampusId,
      override_allowed: true,
    });
  }

  // Overlapping active assignments
  const { data: otherAssignments } = await supabase
    .from("shift_assignments")
    .select("id, shift_id, status")
    .eq("church_id", input.churchId)
    .eq("membership_id", input.membershipId)
    .in("status", [...ACTIVE_ASSIGNMENT_STATUSES]);

  const otherShiftIds = [
    ...new Set(
      (otherAssignments ?? [])
        .map((row) => row.shift_id as string)
        .filter((id) => id !== shift.id),
    ),
  ];

  if (otherShiftIds.length > 0) {
    const { data: otherShifts } = await supabase
      .from("schedule_shifts")
      .select("id, title, start_at, end_at, status")
      .eq("church_id", input.churchId)
      .in("id", otherShiftIds)
      .neq("status", "cancelled");

    for (const other of otherShifts ?? []) {
      if (
        rangesOverlap(
          shift.start_at,
          shift.end_at,
          other.start_at as string,
          other.end_at as string,
        )
      ) {
        conflicts.push({
          conflict_type: "overlapping_shift",
          severity: "blocker",
          message: `Already assigned to overlapping shift “${other.title}”.`,
          related_record_id: other.id as string,
          override_allowed: allowOverride,
        });
      }
    }
  }

  // Unavailability
  const { data: unavailable } = await supabase
    .from("member_unavailability")
    .select("id, start_at, end_at, title, status")
    .eq("church_id", input.churchId)
    .eq("membership_id", input.membershipId)
    .eq("status", "active");

  for (const block of unavailable ?? []) {
    if (
      rangesOverlap(
        shift.start_at,
        shift.end_at,
        block.start_at as string,
        block.end_at as string,
      )
    ) {
      conflicts.push({
        conflict_type: "unavailable",
        severity: preventUnavailable ? "blocker" : "warning",
        message: `Member is unavailable${block.title ? ` (${block.title})` : ""} during this shift.`,
        related_record_id: block.id as string,
        override_allowed: preventUnavailable ? allowOverride : true,
      });
    }
  }

  // Certification warnings (soft unless settings enforce)
  if (
    shift.required_certifications.length > 0 &&
    shift.minimum_certified_member_count > 0
  ) {
    const { data: certs } = await supabase
      .from("certifications")
      .select("id, certification_type, expiration_date, user_id")
      .eq("church_id", input.churchId)
      .eq("user_id", input.userId);

    const now = Date.now();
    const validTypes = new Set(
      (certs ?? [])
        .filter((cert) => {
          if (!cert.expiration_date) return true;
          return new Date(cert.expiration_date as string).getTime() >= now;
        })
        .map((cert) =>
          String(cert.certification_type ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );

    const missing = shift.required_certifications.filter(
      (required) => !validTypes.has(required.trim().toLowerCase()),
    );

    if (missing.length > 0) {
      const enforce = settings?.enforce_certification_requirements === true;
      conflicts.push({
        conflict_type: "missing_certification",
        severity: enforce ? "blocker" : "warning",
        message: `Missing certification(s): ${missing.join(", ")}.`,
        related_record_id: null,
        override_allowed: enforce ? allowOverride : true,
      });
    }
  }

  return conflicts;
}

export function hasBlockingConflicts(conflicts: ScheduleConflict[]): boolean {
  return conflicts.some((c) => c.severity === "blocker");
}

export function openPositionsForShift(shift: ScheduleShift): number {
  return Math.max(
    0,
    shift.required_member_count - (shift.confirmed_assignment_count ?? 0),
  );
}

export function isStaffingStatus(status: string): boolean {
  return (CONFIRMED_STAFFING_STATUSES as readonly string[]).includes(status);
}

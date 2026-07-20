import { createClient } from "@/lib/supabase/server";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import type {
  AvailabilityConflictRow,
  MemberUnavailability,
  TeamAvailabilityRow,
  UnavailabilityReason,
} from "@/lib/schedule/types";

function isMissingRelation(message: string): boolean {
  return Boolean(scheduleMigrationHintFromError(message));
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  );
}

/** Strip private notes unless the viewer owns the row. */
export function redactUnavailabilityNotes(
  row: MemberUnavailability,
  viewerUserId: string,
  canViewPrivateNotes: boolean,
): MemberUnavailability {
  if (canViewPrivateNotes || row.user_id === viewerUserId) {
    return row;
  }
  return { ...row, notes: null };
}

export async function listMyUnavailability(
  churchId: string,
  userId: string,
): Promise<{ items: MemberUnavailability[]; tablesAvailable: boolean; hint?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("member_unavailability")
      .select("*")
      .eq("church_id", churchId)
      .eq("user_id", userId)
      .order("start_at", { ascending: false });

    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          items: [],
          tablesAvailable: false,
          hint: SCHEDULE_MIGRATION_HINT,
        };
      }
      throw new Error(error.message);
    }

    return {
      items: (data ?? []) as MemberUnavailability[],
      tablesAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        items: [],
        tablesAvailable: false,
        hint: SCHEDULE_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

export async function getUnavailabilityById(
  id: string,
  churchId: string,
  viewerUserId: string,
  canViewPrivateNotes: boolean,
): Promise<MemberUnavailability | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("member_unavailability")
      .select("*")
      .eq("id", id)
      .eq("church_id", churchId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    if (!data) return null;
    return redactUnavailabilityNotes(
      data as MemberUnavailability,
      viewerUserId,
      canViewPrivateNotes,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

export async function listTeamUnavailabilityInRange(
  churchId: string,
  rangeStartIso: string,
  rangeEndIso: string,
  viewerUserId: string,
  canViewPrivateNotes: boolean,
): Promise<{
  items: MemberUnavailability[];
  tablesAvailable: boolean;
  hint?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("member_unavailability")
      .select("*")
      .eq("church_id", churchId)
      .eq("status", "active")
      .lt("start_at", rangeEndIso)
      .gt("end_at", rangeStartIso)
      .order("start_at", { ascending: true });

    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          items: [],
          tablesAvailable: false,
          hint: SCHEDULE_MIGRATION_HINT,
        };
      }
      throw new Error(error.message);
    }

    const rows = ((data ?? []) as MemberUnavailability[]).map((row) =>
      redactUnavailabilityNotes(row, viewerUserId, canViewPrivateNotes),
    );

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", userIds);
      const nameById = new Map<string, string>();
      for (const profile of profiles ?? []) {
        const name =
          (profile.full_name as string | null)?.trim() ||
          [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          "Team member";
        nameById.set(profile.id as string, name);
      }
      for (const row of rows) {
        row.member_name = nameById.get(row.user_id) ?? "Team member";
      }
    }

    return { items: rows, tablesAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        items: [],
        tablesAvailable: false,
        hint: SCHEDULE_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

export async function getTeamAvailabilityView(
  churchId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<{
  rows: TeamAvailabilityRow[];
  tablesAvailable: boolean;
  hint?: string;
}> {
  try {
    const supabase = await createClient();
    const team = await listChurchTeamMemberships(churchId);
    const active = team.filter((m) => m.status === "active");

    const { data: blocks, error: blockError } = await supabase
      .from("member_unavailability")
      .select(
        "id, membership_id, user_id, title, reason_category, start_at, end_at, all_day, status",
      )
      .eq("church_id", churchId)
      .eq("status", "active")
      .lt("start_at", rangeEndIso)
      .gt("end_at", rangeStartIso);

    if (blockError) {
      if (isMissingRelation(blockError.message)) {
        return {
          rows: [],
          tablesAvailable: false,
          hint: SCHEDULE_MIGRATION_HINT,
        };
      }
      throw new Error(blockError.message);
    }

    const { data: assignments, error: assignError } = await supabase
      .from("shift_assignments")
      .select("id, membership_id, shift_id, status")
      .eq("church_id", churchId)
      .in("status", [...ACTIVE_ASSIGNMENT_STATUSES]);

    if (assignError) {
      if (isMissingRelation(assignError.message)) {
        return {
          rows: [],
          tablesAvailable: false,
          hint: SCHEDULE_MIGRATION_HINT,
        };
      }
      throw new Error(assignError.message);
    }

    const shiftIds = [
      ...new Set((assignments ?? []).map((a) => a.shift_id as string)),
    ];
    const shiftById = new Map<
      string,
      { title: string; start_at: string; end_at: string }
    >();
    if (shiftIds.length > 0) {
      const { data: shifts } = await supabase
        .from("schedule_shifts")
        .select("id, title, start_at, end_at, status")
        .eq("church_id", churchId)
        .in("id", shiftIds)
        .neq("status", "cancelled");
      for (const shift of shifts ?? []) {
        if (
          rangesOverlap(
            rangeStartIso,
            rangeEndIso,
            shift.start_at as string,
            shift.end_at as string,
          )
        ) {
          shiftById.set(shift.id as string, {
            title: shift.title as string,
            start_at: shift.start_at as string,
            end_at: shift.end_at as string,
          });
        }
      }
    }

    const rows: TeamAvailabilityRow[] = active.map((member) => {
      const unavailableBlocks = (blocks ?? [])
        .filter((b) => b.membership_id === member.membershipId)
        .map((b) => ({
          id: b.id as string,
          start_at: b.start_at as string,
          end_at: b.end_at as string,
          all_day: Boolean(b.all_day),
          title: (b.title as string | null) ?? null,
          reason_category: b.reason_category as UnavailabilityReason,
        }));

      const memberAssignments = (assignments ?? [])
        .filter((a) => a.membership_id === member.membershipId)
        .map((a) => {
          const shift = shiftById.get(a.shift_id as string);
          if (!shift) return null;
          return {
            id: a.id as string,
            shift_id: a.shift_id as string,
            shift_title: shift.title,
            start_at: shift.start_at,
            end_at: shift.end_at,
            status: a.status as string,
          };
        })
        .filter(Boolean) as TeamAvailabilityRow["assignments"];

      let conflictCount = 0;
      for (const block of unavailableBlocks) {
        for (const assignment of memberAssignments) {
          if (
            rangesOverlap(
              block.start_at,
              block.end_at,
              assignment.start_at,
              assignment.end_at,
            )
          ) {
            conflictCount += 1;
          }
        }
      }

      return {
        membershipId: member.membershipId,
        userId: member.userId,
        name: member.name,
        role: member.role,
        unavailableBlocks,
        assignments: memberAssignments,
        conflictCount,
      };
    });

    rows.sort((a, b) => {
      if (a.conflictCount !== b.conflictCount) {
        return b.conflictCount - a.conflictCount;
      }
      return a.name.localeCompare(b.name);
    });

    return { rows, tablesAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        rows: [],
        tablesAvailable: false,
        hint: SCHEDULE_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

export async function listAvailabilityConflicts(
  churchId: string,
  rangeStartIso: string,
  rangeEndIso: string,
): Promise<{
  items: AvailabilityConflictRow[];
  tablesAvailable: boolean;
  hint?: string;
}> {
  try {
    const teamView = await getTeamAvailabilityView(
      churchId,
      rangeStartIso,
      rangeEndIso,
    );
    if (!teamView.tablesAvailable) {
      return {
        items: [],
        tablesAvailable: false,
        hint: teamView.hint,
      };
    }

    const supabase = await createClient();
    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("id, conflict_override")
      .eq("church_id", churchId);

    const overrideById = new Map(
      (assignments ?? []).map((a) => [
        a.id as string,
        Boolean(a.conflict_override),
      ]),
    );

    const items: AvailabilityConflictRow[] = [];
    for (const row of teamView.rows) {
      for (const block of row.unavailableBlocks) {
        for (const assignment of row.assignments) {
          if (
            rangesOverlap(
              block.start_at,
              block.end_at,
              assignment.start_at,
              assignment.end_at,
            )
          ) {
            items.push({
              membershipId: row.membershipId,
              memberName: row.name,
              unavailabilityId: block.id,
              unavailabilityStart: block.start_at,
              unavailabilityEnd: block.end_at,
              assignmentId: assignment.id,
              shiftId: assignment.shift_id,
              shiftTitle: assignment.shift_title,
              shiftStart: assignment.start_at,
              shiftEnd: assignment.end_at,
              assignmentStatus: assignment.status,
              overridden: overrideById.get(assignment.id) ?? false,
            });
          }
        }
      }
    }

    return { items, tablesAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        items: [],
        tablesAvailable: false,
        hint: SCHEDULE_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

import { createClient } from "@/lib/supabase/server";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import {
  openPositionsForShift,
  validateShiftAssignment,
} from "@/lib/schedule/conflicts";
import type {
  EligibleMemberOption,
  ScheduleShift,
  ScheduleShiftListResult,
  ScheduleShiftStatus,
  ScheduleShiftType,
  ShiftAssignment,
} from "@/lib/schedule/types";

function isMissingRelation(message: string): boolean {
  return Boolean(scheduleMigrationHintFromError(message));
}

async function attachShiftMeta(
  churchId: string,
  rows: ScheduleShift[],
): Promise<ScheduleShift[]> {
  if (rows.length === 0) return rows;
  const supabase = await createClient();

  const campusIds = [
    ...new Set(rows.map((r) => r.campus_id).filter(Boolean)),
  ] as string[];
  const eventIds = [
    ...new Set(rows.map((r) => r.event_id).filter(Boolean)),
  ] as string[];

  const campusMap = new Map<string, string>();
  const eventMap = new Map<string, string>();

  if (campusIds.length > 0) {
    const { data } = await supabase
      .from("campuses")
      .select("id, name")
      .eq("church_id", churchId)
      .in("id", campusIds);
    for (const row of data ?? []) {
      campusMap.set(row.id as string, row.name as string);
    }
  }

  if (eventIds.length > 0) {
    const { data } = await supabase
      .from("schedule_events")
      .select("id, title")
      .eq("church_id", churchId)
      .in("id", eventIds);
    for (const row of data ?? []) {
      eventMap.set(row.id as string, row.title as string);
    }
  }

  return rows.map((row) => ({
    ...row,
    campus_name: row.campus_id ? (campusMap.get(row.campus_id) ?? null) : null,
    event_title: row.event_id ? (eventMap.get(row.event_id) ?? null) : null,
    open_positions: openPositionsForShift(row),
  }));
}

export type ListScheduleShiftsParams = {
  q?: string;
  status?: ScheduleShiftStatus | "";
  shiftType?: ScheduleShiftType | "";
  eventId?: string;
  campusId?: string;
  from?: string;
  to?: string;
  unfilledOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listScheduleShifts(
  churchId: string,
  params: ListScheduleShiftsParams = {},
): Promise<ScheduleShiftListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = await createClient();
    let query = supabase
      .from("schedule_shifts")
      .select("*", { count: "exact" })
      .eq("church_id", churchId)
      .order("start_at", { ascending: true })
      .range(from, to);

    if (params.q?.trim()) query = query.ilike("title", `%${params.q.trim()}%`);
    if (params.status) query = query.eq("status", params.status);
    if (params.shiftType) query = query.eq("shift_type", params.shiftType);
    if (params.eventId) query = query.eq("event_id", params.eventId);
    if (params.campusId) query = query.eq("campus_id", params.campusId);
    if (params.from) query = query.gte("end_at", params.from);
    if (params.to) query = query.lte("start_at", params.to);

    const { data, error, count } = await query;
    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          tablesAvailable: false,
        };
      }
      throw new Error(error.message);
    }

    let items = await attachShiftMeta(churchId, (data ?? []) as ScheduleShift[]);
    if (params.unfilledOnly) {
      items = items.filter((item) => (item.open_positions ?? 0) > 0);
    }

    return {
      items,
      total: count ?? items.length,
      page,
      pageSize,
      tablesAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        tablesAvailable: false,
      };
    }
    throw error;
  }
}

export async function getScheduleShiftById(
  shiftId: string,
  churchId: string,
): Promise<ScheduleShift | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schedule_shifts")
      .select("*")
      .eq("id", shiftId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    if (!data) return null;
    const [row] = await attachShiftMeta(churchId, [data as ScheduleShift]);
    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

export async function listAssignmentsForShift(
  shiftId: string,
  churchId: string,
): Promise<ShiftAssignment[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shift_assignments")
      .select("*")
      .eq("church_id", churchId)
      .eq("shift_id", shiftId)
      .order("assigned_at", { ascending: true });

    if (error) {
      if (isMissingRelation(error.message)) return [];
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ShiftAssignment[];
    const userIds = [
      ...new Set(rows.map((r) => r.user_id).filter(Boolean)),
    ] as string[];
    if (userIds.length === 0) return rows;

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

    return rows.map((row) => ({
      ...row,
      member_name: row.user_id ? (nameById.get(row.user_id) ?? "Team member") : "—",
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return [];
    throw error;
  }
}

export async function listMyAssignments(
  churchId: string,
  userId: string,
): Promise<ShiftAssignment[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shift_assignments")
      .select("*")
      .eq("church_id", churchId)
      .eq("user_id", userId)
      .order("assigned_at", { ascending: false });

    if (error) {
      if (isMissingRelation(error.message)) return [];
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ShiftAssignment[];
    const shiftIds = [...new Set(rows.map((r) => r.shift_id))];
    if (shiftIds.length === 0) return rows;

    const { data: shifts } = await supabase
      .from("schedule_shifts")
      .select("id, title, start_at, end_at")
      .eq("church_id", churchId)
      .in("id", shiftIds);

    const shiftById = new Map(
      (shifts ?? []).map((s) => [s.id as string, s]),
    );

    return rows.map((row) => {
      const shift = shiftById.get(row.shift_id);
      return {
        ...row,
        shift_title: (shift?.title as string | undefined) ?? "Shift",
        shift_start_at: (shift?.start_at as string | undefined) ?? null,
        shift_end_at: (shift?.end_at as string | undefined) ?? null,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return [];
    throw error;
  }
}

export async function listEventOptionsForShifts(
  churchId: string,
): Promise<Array<{ id: string; title: string; start_at: string }>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schedule_events")
      .select("id, title, start_at")
      .eq("church_id", churchId)
      .not("status", "in", '("cancelled","archived")')
      .order("start_at", { ascending: true })
      .limit(200);

    if (error) {
      if (isMissingRelation(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as Array<{
      id: string;
      title: string;
      start_at: string;
    }>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return [];
    throw error;
  }
}

export async function getChurchScheduleSettings(churchId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("church_schedule_settings")
      .select("*")
      .eq("church_id", churchId)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

export async function listEligibleMembersForShift(
  churchId: string,
  shift: ScheduleShift,
  options?: { allowOverride?: boolean },
): Promise<{ members: EligibleMemberOption[]; tablesAvailable: boolean; hint?: string }> {
  try {
    const supabase = await createClient();
    const settings = await getChurchScheduleSettings(churchId);
    const team = await listChurchTeamMemberships(churchId);
    const active = team.filter((m) => m.status === "active");

    const { data: existing } = await supabase
      .from("shift_assignments")
      .select("membership_id, status")
      .eq("church_id", churchId)
      .eq("shift_id", shift.id)
      .not("status", "in", '("declined","cancelled")');

    const assigned = new Set(
      (existing ?? [])
        .map((row) => row.membership_id as string | null)
        .filter(Boolean),
    );

    const members: EligibleMemberOption[] = [];
    for (const member of active) {
      if (assigned.has(member.membershipId)) continue;

      const conflicts = await validateShiftAssignment(supabase, {
        churchId,
        shift,
        membershipId: member.membershipId,
        userId: member.userId,
        membershipStatus: member.status,
        allowOverride: options?.allowOverride ?? false,
        settings: settings as {
          prevent_assignment_during_unavailability?: boolean;
          allow_conflict_override?: boolean;
          enforce_certification_requirements?: boolean;
        } | null,
      });

      members.push({
        membershipId: member.membershipId,
        userId: member.userId,
        name: member.name,
        email: member.email,
        role: member.role,
        warnings: conflicts.filter((c) => c.severity === "warning"),
        blockers: conflicts.filter((c) => c.severity === "blocker"),
      });
    }

    members.sort((a, b) => {
      if (a.blockers.length !== b.blockers.length) {
        return a.blockers.length - b.blockers.length;
      }
      return a.name.localeCompare(b.name);
    });

    return { members, tablesAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        members: [],
        tablesAvailable: false,
        hint: SCHEDULE_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

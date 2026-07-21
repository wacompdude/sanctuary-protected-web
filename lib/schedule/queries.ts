import { createClient } from "@/lib/supabase/server";
import {
  labelForScheduleEventStatus,
  labelForScheduleEventType,
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import type {
  CampusOption,
  ScheduleCalendarItem,
  ScheduleEvent,
  ScheduleEventListResult,
  ScheduleEventStatus,
  ScheduleEventType,
} from "@/lib/schedule/types";

function isMissingRelation(message: string): boolean {
  return Boolean(scheduleMigrationHintFromError(message));
}

export async function listScheduleCampuses(
  churchId: string,
): Promise<CampusOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campuses")
    .select("id, name, status")
    .eq("church_id", churchId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CampusOption[];
}

async function attachCampusNames(
  churchId: string,
  rows: ScheduleEvent[],
): Promise<ScheduleEvent[]> {
  const campusIds = [
    ...new Set(rows.map((row) => row.campus_id).filter(Boolean)),
  ] as string[];
  if (campusIds.length === 0) return rows;

  const supabase = await createClient();
  const { data } = await supabase
    .from("campuses")
    .select("id, name")
    .eq("church_id", churchId)
    .in("id", campusIds);
  const nameById = new Map(
    (data ?? []).map((campus) => [campus.id as string, campus.name as string]),
  );
  return rows.map((row) => ({
    ...row,
    campus_name: row.campus_id ? (nameById.get(row.campus_id) ?? null) : null,
  }));
}

export type ListScheduleEventsParams = {
  q?: string;
  eventType?: ScheduleEventType | "";
  status?: ScheduleEventStatus | "";
  campusId?: string;
  campusFilterOr?: string | null;
  from?: string;
  to?: string;
  includeCancelled?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listScheduleEvents(
  churchId: string,
  params: ListScheduleEventsParams = {},
): Promise<ScheduleEventListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = await createClient();
    let query = supabase
      .from("schedule_events")
      .select("*", { count: "exact" })
      .eq("church_id", churchId)
      .order("start_at", { ascending: true })
      .range(from, to);

    if (params.q?.trim()) {
      query = query.ilike("title", `%${params.q.trim()}%`);
    }
    if (params.eventType) {
      query = query.eq("event_type", params.eventType);
    }
    if (params.status) {
      query = query.eq("status", params.status);
    } else if (!params.includeCancelled) {
      query = query.neq("status", "archived");
    }
    if (params.campusFilterOr) {
      query = query.or(params.campusFilterOr);
    } else if (params.campusId) {
      query = query.or(
        `campus_id.eq.${params.campusId},campus_id.is.null`,
      );
    }
    if (params.from) {
      query = query.gte("end_at", params.from);
    }
    if (params.to) {
      query = query.lte("start_at", params.to);
    }

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

    const items = await attachCampusNames(
      churchId,
      (data ?? []) as ScheduleEvent[],
    );
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

export async function getScheduleEventById(
  eventId: string,
  churchId: string,
): Promise<ScheduleEvent | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schedule_events")
      .select("*")
      .eq("id", eventId)
      .eq("church_id", churchId)
      .maybeSingle();

    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    if (!data) return null;

    const [withCampus] = await attachCampusNames(churchId, [
      data as ScheduleEvent,
    ]);

    const { count } = await supabase
      .from("schedule_shifts")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("event_id", eventId)
      .neq("status", "cancelled");

    return {
      ...withCampus,
      shift_count: count ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

export async function listScheduleCalendarItems(
  churchId: string,
  rangeStartIso: string,
  rangeEndIso: string,
  filters?: {
    eventType?: string;
    campusId?: string;
    campusFilterOr?: string | null;
    includeCancelled?: boolean;
  },
): Promise<{ items: ScheduleCalendarItem[]; tablesAvailable: boolean; hint?: string }> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("schedule_events")
      .select(
        "id, title, start_at, end_at, all_day, event_type, status, risk_level, campus_id, location_name",
      )
      .eq("church_id", churchId)
      .lt("start_at", rangeEndIso)
      .gt("end_at", rangeStartIso)
      .order("start_at", { ascending: true });

    if (!filters?.includeCancelled) {
      query = query.not("status", "in", '("cancelled","archived")');
    }
    if (filters?.eventType) {
      query = query.eq("event_type", filters.eventType);
    }
    if (filters?.campusFilterOr) {
      query = query.or(filters.campusFilterOr);
    } else if (filters?.campusId) {
      query = query.or(
        `campus_id.eq.${filters.campusId},campus_id.is.null`,
      );
    }

    const { data, error } = await query;
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

    const rows = (data ?? []) as Array<{
      id: string;
      title: string;
      start_at: string;
      end_at: string;
      all_day: boolean;
      event_type: ScheduleEventType;
      status: ScheduleEventStatus;
      risk_level: ScheduleEvent["risk_level"];
      campus_id: string | null;
      location_name: string | null;
    }>;

    const withNames = await attachCampusNames(
      churchId,
      rows.map((row) => ({
        ...row,
        church_id: churchId,
        description: null,
        building: null,
        room: null,
        timezone: "UTC",
        recurrence_rule: null,
        recurrence_end_at: null,
        parent_event_id: null,
        security_coverage_required: true,
        estimated_attendance: null,
        recommended_notification_group_ids: [],
        created_by: null,
        updated_by: null,
        created_at: row.start_at,
        updated_at: row.start_at,
        cancelled_at: null,
        archived_at: null,
      })),
    );

    const items: ScheduleCalendarItem[] = withNames.map((row) => ({
      id: row.id,
      kind: "event",
      title: row.title,
      start_at: row.start_at,
      end_at: row.end_at,
      all_day: row.all_day,
      event_type: row.event_type,
      status: row.status,
      risk_level: row.risk_level,
      campus_id: row.campus_id,
      campus_name: row.campus_name ?? null,
      location_name: row.location_name,
      href: `/schedule/events/${row.id}`,
      accessible_label: `${labelForScheduleEventType(row.event_type)} event: ${row.title}, ${labelForScheduleEventStatus(row.status)}`,
    }));

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

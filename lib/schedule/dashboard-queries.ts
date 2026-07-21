import { createClient } from "@/lib/supabase/server";
import { scheduleMigrationHintFromError } from "@/lib/schedule/constants";
import type { ScheduleDashboardSummary } from "@/lib/schedule/types";

function isMissingRelation(message: string): boolean {
  return Boolean(scheduleMigrationHintFromError(message));
}

function startOfLocalDayIso(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "01";
  // Approximate local midnight as UTC parse of Y-M-D — good enough for day windows
  // when combined with a generous end-of-day bound below.
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`;
}

/**
 * Real scheduling summary counts for the church dashboard.
 * Returns zeros with tablesAvailable=false when migration 035 is not applied.
 */
export async function getScheduleDashboardSummary(
  churchId: string,
  userId: string,
  timeZone = "America/Los_Angeles",
  options?: { campusFilterOr?: string | null },
): Promise<ScheduleDashboardSummary> {
  const empty: ScheduleDashboardSummary = {
    tablesAvailable: false,
    upcomingEvents: 0,
    todaysShifts: 0,
    unfilledShifts: 0,
    pendingResponses: 0,
    unavailableToday: 0,
    upcomingTraining: 0,
    myNextShift: null,
  };

  try {
    const supabase = await createClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayStart = startOfLocalDayIso(timeZone, now);
    const dayEnd = new Date(
      new Date(dayStart).getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();
    const campusOr = options?.campusFilterOr ?? null;

    let upcomingEventsQuery = supabase
      .from("schedule_events")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .gte("start_at", nowIso)
      .lte("start_at", in7Days)
      .not("status", "in", '("cancelled","archived")');
    if (campusOr) upcomingEventsQuery = upcomingEventsQuery.or(campusOr);

    let todaysShiftsQuery = supabase
      .from("schedule_shifts")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .lt("start_at", dayEnd)
      .gt("end_at", dayStart)
      .not("status", "in", '("cancelled","completed")');
    if (campusOr) todaysShiftsQuery = todaysShiftsQuery.or(campusOr);

    let unfilledQuery = supabase
      .from("schedule_shifts")
      .select("id, required_member_count, confirmed_assignment_count")
      .eq("church_id", churchId)
      .gte("start_at", nowIso)
      .lte("start_at", in7Days)
      .not("status", "in", '("cancelled","completed","draft")');
    if (campusOr) unfilledQuery = unfilledQuery.or(campusOr);

    let trainingQuery = supabase
      .from("schedule_events")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("event_type", "training")
      .gte("start_at", nowIso)
      .lte("start_at", in7Days)
      .not("status", "in", '("cancelled","archived")');
    if (campusOr) trainingQuery = trainingQuery.or(campusOr);

    const [
      upcomingEventsRes,
      todaysShiftsRes,
      unfilledRes,
      pendingRes,
      unavailableRes,
      trainingRes,
      myNextRes,
    ] = await Promise.all([
      upcomingEventsQuery,
      todaysShiftsQuery,
      unfilledQuery,
      supabase
        .from("shift_assignments")
        .select("id", { count: "exact", head: true })
        .eq("church_id", churchId)
        .in("status", ["pending", "invited"]),
      supabase
        .from("member_unavailability")
        .select("id", { count: "exact", head: true })
        .eq("church_id", churchId)
        .eq("status", "active")
        .lt("start_at", dayEnd)
        .gt("end_at", dayStart),
      trainingQuery,
      supabase
        .from("shift_assignments")
        .select(
          `
          id,
          status,
          shift:schedule_shifts!inner (
            id,
            title,
            start_at,
            end_at,
            status
          )
        `,
        )
        .eq("church_id", churchId)
        .eq("user_id", userId)
        .in("status", ["pending", "invited", "accepted", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const firstError =
      upcomingEventsRes.error ??
      todaysShiftsRes.error ??
      unfilledRes.error ??
      pendingRes.error ??
      unavailableRes.error ??
      trainingRes.error ??
      myNextRes.error;

    if (firstError) {
      if (isMissingRelation(firstError.message)) return empty;
      throw new Error(firstError.message);
    }

    const unfilledShifts = (unfilledRes.data ?? []).filter((row) => {
      const required = Number(row.required_member_count ?? 0);
      const confirmed = Number(row.confirmed_assignment_count ?? 0);
      return required > confirmed;
    }).length;

    let myNextShift: ScheduleDashboardSummary["myNextShift"] = null;
    const candidates = (myNextRes.data ?? [])
      .map((row) => {
        const raw = row.shift;
        const shift = (
          Array.isArray(raw) ? raw[0] : raw
        ) as Record<string, unknown> | null;
        if (!shift) return null;
        if (
          shift.status === "cancelled" ||
          shift.status === "completed"
        ) {
          return null;
        }
        const start = String(shift.start_at ?? "");
        if (!start || new Date(start).getTime() < now.getTime()) return null;
        return {
          id: String(shift.id),
          title: String(shift.title ?? "Shift"),
          start_at: start,
          end_at: String(shift.end_at ?? ""),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );
    myNextShift = candidates[0] ?? null;

    return {
      tablesAvailable: true,
      upcomingEvents: upcomingEventsRes.count ?? 0,
      todaysShifts: todaysShiftsRes.count ?? 0,
      unfilledShifts,
      pendingResponses: pendingRes.count ?? 0,
      unavailableToday: unavailableRes.count ?? 0,
      upcomingTraining: trainingRes.count ?? 0,
      myNextShift,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return empty;
    throw error;
  }
}

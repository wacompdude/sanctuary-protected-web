import { createClient } from "@/lib/supabase/server";
import type { Incident, IncidentUpdate } from "./types";
import type { IncidentListSort } from "./format";

export {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
  getOperationalChurchContext,
} from "@/lib/church/auth";

export async function listIncidentsForChurch(
  churchId: string,
  sort: IncidentListSort = "occurred_at_desc",
) {
  const supabase = await createClient();

  let query = supabase.from("incidents").select("*").eq("church_id", churchId);

  switch (sort) {
    case "occurred_at_asc":
      query = query.order("occurred_at", { ascending: true });
      break;
    case "severity_desc":
      // Enum order is not severity-ranked in Postgres; sort by occurred_at then refine in memory.
      query = query.order("occurred_at", { ascending: false });
      break;
    case "status":
      query = query.order("status", { ascending: true }).order("occurred_at", {
        ascending: false,
      });
      break;
    case "occurred_at_desc":
    default:
      query = query.order("occurred_at", { ascending: false });
      break;
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Incident[];
  if (sort !== "severity_desc") {
    return rows;
  }

  const severityRank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...rows].sort((a, b) => {
    const diff =
      (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
    if (diff !== 0) return diff;
    return (
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    );
  });
}

export async function getIncidentWithUpdates(incidentId: string) {
  const supabase = await createClient();

  const { data: incident, error: incidentError } = await supabase
    .from("incidents")
    .select("*")
    .eq("id", incidentId)
    .maybeSingle();

  if (incidentError) {
    throw new Error(incidentError.message);
  }

  if (!incident) {
    return null;
  }

  const { data: updates, error: updatesError } = await supabase
    .from("incident_updates")
    .select("*")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (updatesError) {
    throw new Error(updatesError.message);
  }

  return {
    ...(incident as Incident),
    updates: (updates ?? []) as IncidentUpdate[],
  };
}

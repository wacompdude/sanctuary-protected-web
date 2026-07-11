import { createClient } from "@/lib/supabase/server";
import type { Incident, IncidentUpdate } from "./types";

export {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";

export async function listIncidentsForChurch(churchId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("incidents")
    .select("*")
    .eq("church_id", churchId)
    .order("occurred_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Incident[];
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

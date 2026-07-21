import { createClient } from "@/lib/supabase/server";
import type { SecurityEvent } from "./types";

export async function listEventsForChurch(
  churchId: string,
  options?: { campusFilterOr?: string | null },
) {
  const supabase = await createClient();

  let query = supabase
    .from("events")
    .select("*")
    .eq("church_id", churchId)
    .order("event_timestamp", { ascending: false });

  if (options?.campusFilterOr) {
    query = query.or(options.campusFilterOr);
  }

  const { data, error } = await query;

  if (error) {
    if (/campus_id/i.test(error.message) && options?.campusFilterOr) {
      return listEventsForChurch(churchId);
    }
    throw new Error(error.message);
  }

  return (data ?? []) as SecurityEvent[];
}

export async function getUnacknowledgedEventCount(
  churchId: string,
  options?: { campusFilterOr?: string | null },
) {
  const supabase = await createClient();

  let query = supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("acknowledgment_status", "unacknowledged");

  if (options?.campusFilterOr) {
    query = query.or(options.campusFilterOr);
  }

  const { count, error } = await query;

  if (error) {
    // Gracefully ignore missing campus_id until migration 036 is applied.
    if (/campus_id/i.test(error.message) && options?.campusFilterOr) {
      const fallback = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("church_id", churchId)
        .eq("acknowledgment_status", "unacknowledged");
      if (fallback.error) throw new Error(fallback.error.message);
      return fallback.count ?? 0;
    }
    throw new Error(error.message);
  }

  return count ?? 0;
}

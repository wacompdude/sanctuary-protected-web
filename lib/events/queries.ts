import { createClient } from "@/lib/supabase/server";
import type { SecurityEvent } from "./types";

export async function listEventsForChurch(churchId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("church_id", churchId)
    .order("event_timestamp", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SecurityEvent[];
}

export async function getUnacknowledgedEventCount(churchId: string) {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("events")
    .select("*", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("acknowledgment_status", "unacknowledged");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

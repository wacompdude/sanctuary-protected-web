import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEndpoint } from "@/lib/notifications/endpoints/types";

function mapEndpoint(row: Record<string, unknown>): NotificationEndpoint {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    user_id: String(row.user_id),
    membership_id: (row.membership_id as string | null) ?? null,
    channel: row.channel as NotificationEndpoint["channel"],
    destination: String(row.destination),
    normalized_destination: String(row.normalized_destination),
    label: (row.label as string | null) ?? null,
    is_primary: Boolean(row.is_primary),
    is_verified: Boolean(row.is_verified),
    verified_at: (row.verified_at as string | null) ?? null,
    status: row.status as NotificationEndpoint["status"],
    consent_status: row.consent_status as NotificationEndpoint["consent_status"],
    consent_recorded_at: (row.consent_recorded_at as string | null) ?? null,
    consent_source: (row.consent_source as string | null) ?? null,
    consent_disclosure_version:
      (row.consent_disclosure_version as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    revoked_at: (row.revoked_at as string | null) ?? null,
  };
}

export async function listMyNotificationEndpoints(
  supabase: SupabaseClient,
  churchId: string,
  userId: string,
): Promise<NotificationEndpoint[]> {
  const { data, error } = await supabase
    .from("notification_endpoints")
    .select("*")
    .eq("church_id", churchId)
    .eq("user_id", userId)
    .neq("status", "revoked")
    .order("channel", { ascending: true })
    .order("is_primary", { ascending: false });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapEndpoint);
}

export async function areEndpointTablesAvailable(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from("notification_endpoints")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  return !/does not exist|schema cache|Could not find the table/i.test(
    error.message,
  );
}

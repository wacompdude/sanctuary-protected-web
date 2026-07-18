import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  normalizeEmail,
  normalizePhoneE164,
} from "@/lib/notifications/endpoints/normalize";

/**
 * Ensure the signed-in user has endpoint rows for Auth email and profile phone.
 * Safe to call on preferences page load. Does not overwrite revoked endpoints.
 */
export async function syncMyNotificationEndpoints(params: {
  supabase: SupabaseClient;
  churchId: string;
  user: User;
  membershipId: string;
}): Promise<{ synced: number; error?: string }> {
  const { supabase, churchId, user, membershipId } = params;
  let synced = 0;

  const email = normalizeEmail(user.email ?? "");
  if (email) {
    const verified = Boolean(user.email_confirmed_at);
    const result = await upsertEndpoint(supabase, {
      church_id: churchId,
      user_id: user.id,
      membership_id: membershipId,
      channel: "email",
      destination: user.email!.trim(),
      normalized_destination: email,
      label: "Account email",
      is_primary: true,
      is_verified: verified,
      verified_at: verified ? (user.email_confirmed_at ?? new Date().toISOString()) : null,
      status: verified ? "active" : "unverified",
      consent_status: "not_required",
      consent_recorded_at: null,
      consent_source: "auth_account",
      consent_disclosure_version: null,
    });
    if (result.error) return { synced, error: result.error };
    synced += result.created ? 1 : 0;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  const phoneRaw =
    typeof profile?.phone === "string" ? profile.phone.trim() : "";
  const phone = phoneRaw ? normalizePhoneE164(phoneRaw) : null;
  if (phone) {
    const result = await upsertEndpoint(supabase, {
      church_id: churchId,
      user_id: user.id,
      membership_id: membershipId,
      channel: "sms",
      destination: phoneRaw,
      normalized_destination: phone,
      label: "Profile phone",
      is_primary: true,
      is_verified: false,
      verified_at: null,
      status: "unverified",
      consent_status: "unknown",
      consent_recorded_at: null,
      consent_source: "profile_phone",
      consent_disclosure_version: null,
    });
    if (result.error) return { synced, error: result.error };
    synced += result.created ? 1 : 0;
  }

  return { synced };
}

async function upsertEndpoint(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ created: boolean; error?: string }> {
  const { data: existing, error: lookupError } = await supabase
    .from("notification_endpoints")
    .select("id, status, consent_status")
    .eq("church_id", row.church_id as string)
    .eq("user_id", row.user_id as string)
    .eq("channel", row.channel as string)
    .eq("normalized_destination", row.normalized_destination as string)
    .maybeSingle();

  if (lookupError) {
    if (/does not exist|schema cache/i.test(lookupError.message)) {
      return { created: false, error: lookupError.message };
    }
    return { created: false, error: lookupError.message };
  }

  if (existing) {
    const existingRow = existing as {
      id: string;
      status: string;
      consent_status: string;
    };
    if (existingRow.status === "revoked") {
      return { created: false };
    }

    // Refresh verification for email; do not clobber SMS consent once set.
    const patch: Record<string, unknown> = {
      membership_id: row.membership_id,
      destination: row.destination,
      label: row.label,
      is_primary: row.is_primary,
    };
    if (row.channel === "email") {
      patch.is_verified = row.is_verified;
      patch.verified_at = row.verified_at;
      patch.status = row.status;
      patch.consent_status = "not_required";
    }

    const { error } = await supabase
      .from("notification_endpoints")
      .update(patch)
      .eq("id", existingRow.id);
    if (error) return { created: false, error: error.message };
    return { created: false };
  }

  // Clear other primaries for channel when inserting a primary.
  if (row.is_primary) {
    await supabase
      .from("notification_endpoints")
      .update({ is_primary: false })
      .eq("church_id", row.church_id as string)
      .eq("user_id", row.user_id as string)
      .eq("channel", row.channel as string)
      .eq("is_primary", true);
  }

  const { error } = await supabase.from("notification_endpoints").insert(row);
  if (error) return { created: false, error: error.message };
  return { created: true };
}

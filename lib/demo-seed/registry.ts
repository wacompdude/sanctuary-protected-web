import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoSeedSummary } from "@/lib/demo-seed/types";
import { bump, log } from "@/lib/demo-seed/types";

export async function getRegisteredId(
  admin: SupabaseClient,
  seedSource: string,
  seedKey: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("demo_seed_records")
    .select("entity_id")
    .eq("seed_source", seedSource)
    .eq("seed_key", seedKey)
    .maybeSingle();
  if (error) throw new Error(`demo_seed_records lookup failed: ${error.message}`);
  return data?.entity_id ? String(data.entity_id) : null;
}

export async function registerSeedRecord(params: {
  admin: SupabaseClient;
  seedSource: string;
  entityTable: string;
  entityId: string;
  seedKey: string;
  metadata?: Record<string, unknown>;
}): Promise<"created" | "updated"> {
  const existing = await getRegisteredId(
    params.admin,
    params.seedSource,
    params.seedKey,
  );

  if (existing) {
    const { error } = await params.admin
      .from("demo_seed_records")
      .update({
        entity_table: params.entityTable,
        entity_id: params.entityId,
        metadata: params.metadata ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("seed_source", params.seedSource)
      .eq("seed_key", params.seedKey);
    if (error) throw new Error(`demo_seed_records update failed: ${error.message}`);
    return existing === params.entityId ? "updated" : "updated";
  }

  const { error } = await params.admin.from("demo_seed_records").insert({
    seed_source: params.seedSource,
    entity_table: params.entityTable,
    entity_id: params.entityId,
    seed_key: params.seedKey,
    metadata: params.metadata ?? {},
  });
  if (error) throw new Error(`demo_seed_records insert failed: ${error.message}`);
  return "created";
}

export async function track(
  summary: DemoSeedSummary,
  domain: string,
  result: "created" | "updated" | "skipped",
  message: string,
): Promise<void> {
  bump(summary, domain, result);
  log(summary, message);
}

/** Dependency-safe cleanup order (children before parents). */
export const DEMO_CLEANUP_TABLE_ORDER = [
  "shift_assignments",
  "schedule_shifts",
  "schedule_events",
  "member_unavailability",
  "medical_supply_usage",
  "medical_supplies",
  "incident_attachments",
  "incident_team_members",
  "incident_updates",
  "safety_concern_incidents",
  "safety_concern_photos",
  "safety_concern_reviews",
  "safety_concern_profile_campuses",
  "safety_concern_profiles",
  "incidents",
  "certifications",
  "team_members",
  "security_equipment",
  "policy_acknowledgments",
  "policy_assignments",
  "policy_approvals",
  "policy_attachments",
  "policy_document_tags",
  "policy_versions",
  "policy_documents",
  "policy_tags",
  "church_threat_levels",
  "notification_preferences",
  "campus_locations",
  "campus_memberships",
  "campuses",
  "church_contacts",
  "church_memberships",
  "church_subscriptions",
  "churches",
] as const;

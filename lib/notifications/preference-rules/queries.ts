import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationChannel, NotificationSeverity } from "@/lib/notifications/types";

export type PreferenceRule = {
  id: string;
  church_id: string;
  user_id: string;
  membership_id: string | null;
  group_id: string | null;
  notification_type: string;
  channel: NotificationChannel;
  enabled: boolean;
  minimum_severity: NotificationSeverity;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
  digest_frequency: string;
  created_at: string;
  updated_at: string;
  group_name?: string | null;
};

export async function listMyPreferenceRules(
  supabase: SupabaseClient,
  churchId: string,
  userId: string,
): Promise<PreferenceRule[]> {
  const { data, error } = await supabase
    .from("notification_preference_rules")
    .select("*")
    .eq("church_id", churchId)
    .eq("user_id", userId)
    .order("notification_type", { ascending: true });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    church_id: String(row.church_id),
    user_id: String(row.user_id),
    membership_id: (row.membership_id as string | null) ?? null,
    group_id: (row.group_id as string | null) ?? null,
    notification_type: String(row.notification_type),
    channel: row.channel as NotificationChannel,
    enabled: Boolean(row.enabled),
    minimum_severity: row.minimum_severity as NotificationSeverity,
    quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
    quiet_hours_start: (row.quiet_hours_start as string | null) ?? null,
    quiet_hours_end: (row.quiet_hours_end as string | null) ?? null,
    timezone: String(row.timezone ?? "America/Los_Angeles"),
    digest_frequency: String(row.digest_frequency ?? "immediate"),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));

  const groupIds = [
    ...new Set(
      rows
        .map((row) => row.group_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (groupIds.length === 0) return rows;

  const { data: groups } = await supabase
    .from("notification_groups")
    .select("id, name")
    .eq("church_id", churchId)
    .in("id", groupIds);

  const names = new Map(
    ((groups ?? []) as Array<{ id: string; name: string }>).map((g) => [
      g.id,
      g.name,
    ]),
  );

  return rows.map((row) => ({
    ...row,
    group_name: row.group_id ? (names.get(row.group_id) ?? null) : null,
  }));
}

export type PreferableGroup = {
  id: string;
  name: string;
  is_system_group: boolean;
  source: "membership" | "role";
};

/** Groups the user can set preferences for: manual memberships + matching system role groups. */
export async function listPreferableGroupsForUser(params: {
  supabase: SupabaseClient;
  churchId: string;
  userId: string;
  membershipId: string;
  role: string;
}): Promise<PreferableGroup[]> {
  const { supabase, churchId, userId, membershipId, role } = params;
  const result = new Map<string, PreferableGroup>();

  const { data: memberRows } = await supabase
    .from("notification_group_members")
    .select("group_id")
    .eq("church_id", churchId)
    .eq("user_id", userId)
    .eq("membership_id", membershipId)
    .eq("status", "active");

  const memberGroupIds = [
    ...new Set(
      ((memberRows ?? []) as Array<{ group_id: string }>).map(
        (row) => row.group_id,
      ),
    ),
  ];

  if (memberGroupIds.length > 0) {
    const { data: memberGroups } = await supabase
      .from("notification_groups")
      .select("id, name, is_system_group, status")
      .eq("church_id", churchId)
      .in("id", memberGroupIds)
      .neq("status", "archived");

    for (const g of (memberGroups ?? []) as Array<{
      id: string;
      name: string;
      is_system_group: boolean;
    }>) {
      result.set(g.id, {
        id: g.id,
        name: g.name,
        is_system_group: g.is_system_group,
        source: "membership",
      });
    }
  }

  const { data: systemGroups } = await supabase
    .from("notification_groups")
    .select("id, name, is_system_group, dynamic_rule_type, dynamic_rule_value, status")
    .eq("church_id", churchId)
    .eq("is_system_group", true)
    .eq("status", "active");

  for (const row of systemGroups ?? []) {
    const g = row as {
      id: string;
      name: string;
      is_system_group: boolean;
      dynamic_rule_type: string | null;
      dynamic_rule_value: string | null;
      status: string;
    };
    const matchesRole =
      g.dynamic_rule_type === "role" && g.dynamic_rule_value === role;
    const matchesAll =
      g.dynamic_rule_type === "membership_status" &&
      g.dynamic_rule_value === "active";
    if (matchesRole || matchesAll) {
      result.set(g.id, {
        id: g.id,
        name: g.name,
        is_system_group: true,
        source: "role",
      });
    }
  }

  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

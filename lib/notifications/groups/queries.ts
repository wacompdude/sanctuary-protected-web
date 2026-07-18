import { createClient } from "@/lib/supabase/server";
import { normalizeMembershipRole } from "@/lib/church/types";
import type {
  NotificationGroup,
  NotificationGroupDefault,
  NotificationGroupListItem,
  NotificationGroupMember,
} from "@/lib/notifications/groups/types";

function mapGroup(row: Record<string, unknown>): NotificationGroup {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    campus_id: (row.campus_id as string | null) ?? null,
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    group_type: row.group_type as NotificationGroup["group_type"],
    status: row.status as NotificationGroup["status"],
    is_system_group: Boolean(row.is_system_group),
    dynamic_rule_type:
      (row.dynamic_rule_type as NotificationGroup["dynamic_rule_type"]) ?? null,
    dynamic_rule_value: (row.dynamic_rule_value as string | null) ?? null,
    allow_member_self_join: Boolean(row.allow_member_self_join),
    allow_member_self_leave: Boolean(row.allow_member_self_leave),
    default_notification_severity:
      row.default_notification_severity as NotificationGroup["default_notification_severity"],
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    archived_at: (row.archived_at as string | null) ?? null,
  };
}

export async function areNotificationGroupTablesAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_groups")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  return /does not exist|schema cache|Could not find the table/i.test(
    error.message,
  );
}

export async function listNotificationGroups(
  churchId: string,
  options?: { includeArchived?: boolean },
): Promise<NotificationGroupListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notification_groups")
    .select(
      "id, church_id, campus_id, name, description, group_type, status, is_system_group, dynamic_rule_type, dynamic_rule_value, allow_member_self_join, allow_member_self_leave, default_notification_severity, created_by, updated_by, created_at, updated_at, archived_at",
    )
    .eq("church_id", churchId)
    .order("name", { ascending: true });

  if (!options?.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      error.message.includes("does not exist")
        ? "Notification groups are not configured yet. Run supabase/migrations/029_notification_groups.sql."
        : error.message,
    );
  }

  const groups = (data ?? []).map((row) => mapGroup(row as Record<string, unknown>));
  if (groups.length === 0) return [];

  const groupIds = groups.map((group) => group.id);
  const campusIds = [
    ...new Set(
      groups
        .map((group) => group.campus_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: memberRows }, { data: campusRows }] = await Promise.all([
    supabase
      .from("notification_group_members")
      .select("group_id")
      .eq("church_id", churchId)
      .eq("status", "active")
      .in("group_id", groupIds),
    campusIds.length > 0
      ? supabase.from("campuses").select("id, name").in("id", campusIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);

  const counts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    const groupId = String((row as { group_id: string }).group_id);
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }

  const campusNames = new Map(
    ((campusRows ?? []) as Array<{ id: string; name: string }>).map((row) => [
      row.id,
      row.name,
    ]),
  );

  return groups.map((group) => ({
    ...group,
    member_count: group.is_system_group ? 0 : (counts.get(group.id) ?? 0),
    campus_name: group.campus_id
      ? (campusNames.get(group.campus_id) ?? null)
      : null,
  }));
}

export async function getNotificationGroup(
  churchId: string,
  groupId: string,
): Promise<NotificationGroup | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_groups")
    .select("*")
    .eq("church_id", churchId)
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapGroup(data as Record<string, unknown>);
}

export async function listNotificationGroupMembers(
  churchId: string,
  groupId: string,
): Promise<NotificationGroupMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_group_members")
    .select(
      "id, church_id, group_id, membership_id, user_id, status, added_by, added_at, removed_at",
    )
    .eq("church_id", churchId)
    .eq("group_id", groupId)
    .eq("status", "active")
    .order("added_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    church_id: string;
    group_id: string;
    membership_id: string;
    user_id: string;
    status: NotificationGroupMember["status"];
    added_by: string | null;
    added_at: string;
    removed_at: string | null;
  }>;

  if (rows.length === 0) return [];

  const membershipIds = rows.map((row) => row.membership_id);
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [{ data: memberships }, { data: profiles }] = await Promise.all([
    supabase
      .from("church_memberships")
      .select("id, role")
      .eq("church_id", churchId)
      .in("id", membershipIds),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, full_name")
      .in("id", userIds),
  ]);

  const roleByMembership = new Map(
    ((memberships ?? []) as Array<{ id: string; role: string }>).map((row) => [
      row.id,
      normalizeMembershipRole(row.role),
    ]),
  );

  const nameByUser = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        full_name: string | null;
      }>
    ).map((row) => {
      const name =
        row.full_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Member";
      return [row.id, name] as const;
    }),
  );

  return rows.map((row) => ({
    ...row,
    display_name: nameByUser.get(row.user_id) ?? "Member",
    role: roleByMembership.get(row.membership_id) ?? null,
  }));
}

export async function listNotificationGroupDefaults(
  churchId: string,
  groupId: string,
): Promise<NotificationGroupDefault[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_group_defaults")
    .select("*")
    .eq("church_id", churchId)
    .eq("group_id", groupId)
    .order("notification_type", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    church_id: String(row.church_id),
    group_id: String(row.group_id),
    notification_type: String(row.notification_type),
    email_enabled: Boolean(row.email_enabled),
    sms_enabled: Boolean(row.sms_enabled),
    push_enabled: Boolean(row.push_enabled),
    in_app_enabled: Boolean(row.in_app_enabled),
    minimum_severity:
      row.minimum_severity as NotificationGroupDefault["minimum_severity"],
    require_acknowledgment: Boolean(row.require_acknowledgment),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

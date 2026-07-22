import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { normalizeMembershipRole } from "@/lib/church/types";
import { NOTIFICATION_GROUP_MAX_NESTING_DEPTH } from "@/lib/notifications/groups/constants";
import {
  expandGroupDescendantIds,
  listActiveNestingEdges,
} from "@/lib/notifications/groups/nesting";
import type {
  EffectiveGroupUser,
  EffectiveMembershipSource,
  NestingEdge,
  NotificationGroup,
  NotificationGroupCounts,
} from "@/lib/notifications/groups/types";

type GroupRow = {
  id: string;
  name: string;
  status: string;
  is_system_group: boolean;
  dynamic_rule_type: string | null;
  dynamic_rule_value: string | null;
};

type MemberHit = {
  userId: string;
  membershipId: string;
  role: string;
  leafGroupId: string;
};

function profileDisplayName(profile: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  return (
    profile.full_name?.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() ||
    "Member"
  );
}

/**
 * Walk from root collecting first-parent edge for path reconstruction.
 */
function buildParentPointers(
  rootGroupId: string,
  edges: NestingEdge[],
  maxDepth: number,
): Map<string, string> {
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = childrenByParent.get(edge.parentGroupId) ?? [];
    list.push(edge.childGroupId);
    childrenByParent.set(edge.parentGroupId, list);
  }

  const parentOf = new Map<string, string>();
  const seen = new Set<string>([rootGroupId]);
  const queue: Array<{ id: string; depth: number }> = [
    { id: rootGroupId, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;
    for (const childId of childrenByParent.get(current.id) ?? []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      parentOf.set(childId, current.id);
      queue.push({ id: childId, depth: current.depth + 1 });
    }
  }

  return parentOf;
}

function pathNames(
  rootId: string,
  leafId: string,
  parentOf: Map<string, string>,
  nameById: Map<string, string>,
): string[] {
  if (rootId === leafId) return [nameById.get(rootId) ?? "Group"];
  const rev: string[] = [];
  let current: string | undefined = leafId;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    rev.push(nameById.get(current) ?? "Group");
    if (current === rootId) break;
    current = parentOf.get(current);
  }
  if (rev[rev.length - 1] !== (nameById.get(rootId) ?? "Group")) {
    rev.push(nameById.get(rootId) ?? "Group");
  }
  return rev.reverse();
}

async function loadGroupsByIds(
  supabase: SupabaseClient,
  churchId: string,
  groupIds: string[],
): Promise<GroupRow[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from("notification_groups")
    .select(
      "id, name, status, is_system_group, dynamic_rule_type, dynamic_rule_value",
    )
    .eq("church_id", churchId)
    .in("id", groupIds)
    .eq("status", "active");

  if (error) throw new Error(error.message);
  return (data ?? []) as GroupRow[];
}

async function collectMembersFromGroups(
  supabase: SupabaseClient,
  churchId: string,
  groups: GroupRow[],
): Promise<MemberHit[]> {
  const hits: MemberHit[] = [];
  const manualGroups = groups.filter(
    (group) => !group.is_system_group || !group.dynamic_rule_type,
  );
  const systemGroups = groups.filter(
    (group) => group.is_system_group && group.dynamic_rule_type,
  );

  if (manualGroups.length > 0) {
    const { data: memberRows, error } = await supabase
      .from("notification_group_members")
      .select("group_id, membership_id, user_id")
      .eq("church_id", churchId)
      .eq("status", "active")
      .in(
        "group_id",
        manualGroups.map((group) => group.id),
      );

    if (error) throw new Error(error.message);

    const membershipIds = [
      ...new Set(
        ((memberRows ?? []) as Array<{ membership_id: string }>).map(
          (row) => row.membership_id,
        ),
      ),
    ];

    if (membershipIds.length > 0) {
      const { data: memberships, error: membershipError } = await supabase
        .from("church_memberships")
        .select("id, user_id, role, status")
        .eq("church_id", churchId)
        .eq("status", "active")
        .in("id", membershipIds);

      if (membershipError) throw new Error(membershipError.message);

      const membershipById = new Map(
        (
          (memberships ?? []) as Array<{
            id: string;
            user_id: string;
            role: string;
          }>
        ).map((row) => [row.id, row]),
      );

      for (const row of (memberRows ?? []) as Array<{
        group_id: string;
        membership_id: string;
        user_id: string;
      }>) {
        const membership = membershipById.get(row.membership_id);
        if (!membership) continue;
        hits.push({
          userId: membership.user_id,
          membershipId: membership.id,
          role: membership.role,
          leafGroupId: row.group_id,
        });
      }
    }
  }

  for (const group of systemGroups) {
    let query = supabase
      .from("church_memberships")
      .select("id, user_id, role, status")
      .eq("church_id", churchId)
      .eq("status", "active");

    if (group.dynamic_rule_type === "role" && group.dynamic_rule_value) {
      query = query.eq("role", group.dynamic_rule_value);
    } else if (
      group.dynamic_rule_type === "membership_status" &&
      group.dynamic_rule_value === "active"
    ) {
      // already filtered
    } else {
      continue;
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as Array<{
      id: string;
      user_id: string;
      role: string;
    }>) {
      hits.push({
        userId: row.user_id,
        membershipId: row.id,
        role: row.role,
        leafGroupId: group.id,
      });
    }
  }

  return hits;
}

/**
 * Central effective-membership resolver for a single root group.
 * Deduplicates users and preserves all inheritance sources/paths.
 */
export async function getEffectiveGroupUsers(
  churchId: string,
  rootGroupId: string,
  options?: {
    client?: SupabaseClient;
    maxDepth?: number;
    edges?: NestingEdge[];
  },
): Promise<EffectiveGroupUser[]> {
  const supabase = options?.client ?? (await createClient());
  const maxDepth = options?.maxDepth ?? NOTIFICATION_GROUP_MAX_NESTING_DEPTH;
  const edges =
    options?.edges ?? (await listActiveNestingEdges(churchId, supabase));

  const descendantIds = expandGroupDescendantIds(rootGroupId, edges, maxDepth);
  const groups = await loadGroupsByIds(supabase, churchId, descendantIds);
  if (groups.length === 0) return [];

  const nameById = new Map(groups.map((group) => [group.id, group.name]));
  const parentOf = buildParentPointers(rootGroupId, edges, maxDepth);
  const hits = await collectMembersFromGroups(supabase, churchId, groups);

  const byUser = new Map<
    string,
    {
      membershipId: string;
      role: string;
      sources: EffectiveMembershipSource[];
    }
  >();

  for (const hit of hits) {
    const isDirect = hit.leafGroupId === rootGroupId;
    const source: EffectiveMembershipSource = {
      type: isDirect ? "direct" : "inherited",
      groupId: hit.leafGroupId,
      groupName: nameById.get(hit.leafGroupId) ?? "Group",
      groupPath: pathNames(rootGroupId, hit.leafGroupId, parentOf, nameById),
    };

    const existing = byUser.get(hit.userId);
    if (!existing) {
      byUser.set(hit.userId, {
        membershipId: hit.membershipId,
        role: hit.role,
        sources: [source],
      });
      continue;
    }

    if (!existing.sources.some((item) => item.groupId === source.groupId)) {
      existing.sources.push(source);
    }
  }

  const userIds = [...byUser.keys()];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name")
    .in("id", userIds);

  const nameByUser = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        full_name: string | null;
      }>
    ).map((row) => [row.id, profileDisplayName(row)] as const),
  );

  return [...byUser.entries()]
    .map(([userId, value]) => ({
      userId,
      membershipId: value.membershipId,
      displayName: nameByUser.get(userId) ?? "Member",
      role: normalizeMembershipRole(value.role),
      sources: value.sources.sort((a, b) =>
        a.groupName.localeCompare(b.groupName),
      ),
      isDirect: value.sources.some((source) => source.type === "direct"),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getNotificationGroupCounts(
  churchId: string,
  group: Pick<NotificationGroup, "id" | "is_system_group">,
  options?: { client?: SupabaseClient },
): Promise<NotificationGroupCounts> {
  const supabase = options?.client ?? (await createClient());
  const edges = await listActiveNestingEdges(churchId, supabase);

  const includedGroups = edges.filter(
    (edge) => edge.parentGroupId === group.id,
  ).length;
  const parentGroups = edges.filter(
    (edge) => edge.childGroupId === group.id,
  ).length;

  let directUsers = 0;
  if (group.is_system_group) {
    // System groups have no stored directs; treat dynamic expansion as effective-only.
    directUsers = 0;
  } else {
    const { count, error } = await supabase
      .from("notification_group_members")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("group_id", group.id)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    directUsers = count ?? 0;
  }

  const effective = await getEffectiveGroupUsers(churchId, group.id, {
    client: supabase,
    edges,
  });

  return {
    directUsers,
    includedGroups,
    parentGroups,
    effectiveUsers: effective.length,
  };
}

/**
 * Expand many root groups into effective audience members for notifications.
 * Dedupes by userId and accumulates source groups (targeted roots + leaf groups).
 */
export async function resolveEffectiveMembersForGroups(
  supabase: SupabaseClient,
  churchId: string,
  rootGroupIds: string[],
): Promise<
  Map<
    string,
    {
      userId: string;
      membershipId: string;
      role: string;
      sourceGroups: Array<{ id: string; name: string }>;
    }
  >
> {
  const members = new Map<
    string,
    {
      userId: string;
      membershipId: string;
      role: string;
      sourceGroups: Array<{ id: string; name: string }>;
    }
  >();

  if (rootGroupIds.length === 0) return members;

  const edges = await listActiveNestingEdges(churchId, supabase);
  const allGroupIds = new Set<string>();
  const rootsByLeaf = new Map<string, Set<string>>();

  for (const rootId of rootGroupIds) {
    const descendants = expandGroupDescendantIds(
      rootId,
      edges,
      NOTIFICATION_GROUP_MAX_NESTING_DEPTH,
    );
    for (const id of descendants) {
      allGroupIds.add(id);
      const roots = rootsByLeaf.get(id) ?? new Set<string>();
      roots.add(rootId);
      rootsByLeaf.set(id, roots);
    }
  }

  const groups = await loadGroupsByIds(supabase, churchId, [...allGroupIds]);
  const nameById = new Map(groups.map((group) => [group.id, group.name]));
  const hits = await collectMembersFromGroups(supabase, churchId, groups);

  for (const hit of hits) {
    const rootIds = rootsByLeaf.get(hit.leafGroupId) ?? new Set<string>();
    const sourceGroups: Array<{ id: string; name: string }> = [];

    for (const rootId of rootIds) {
      sourceGroups.push({
        id: rootId,
        name: nameById.get(rootId) ?? "Group",
      });
    }
    if (!rootIds.has(hit.leafGroupId)) {
      sourceGroups.push({
        id: hit.leafGroupId,
        name: nameById.get(hit.leafGroupId) ?? "Group",
      });
    }

    const existing = members.get(hit.userId);
    if (!existing) {
      members.set(hit.userId, {
        userId: hit.userId,
        membershipId: hit.membershipId,
        role: hit.role,
        sourceGroups,
      });
      continue;
    }

    for (const source of sourceGroups) {
      if (!existing.sourceGroups.some((item) => item.id === source.id)) {
        existing.sourceGroups.push(source);
      }
    }
  }

  return members;
}

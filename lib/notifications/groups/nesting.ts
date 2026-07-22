import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_GROUP_MAX_NESTING_DEPTH } from "@/lib/notifications/groups/constants";
import type {
  NestingEdge,
  NotificationGroup,
  NotificationGroupNesting,
  NotificationGroupNestingSummary,
  NotificationGroupSummary,
} from "@/lib/notifications/groups/types";

function isMissingNestingTable(message: string): boolean {
  return /notification_group_nestings|does not exist|schema cache|Could not find the table/i.test(
    message,
  );
}

function mapNesting(row: Record<string, unknown>): NotificationGroupNesting {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    parent_group_id: String(row.parent_group_id),
    child_group_id: String(row.child_group_id),
    status: row.status as NotificationGroupNesting["status"],
    added_by: (row.added_by as string | null) ?? null,
    added_at: String(row.added_at),
    removed_at: (row.removed_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapGroupSummary(row: Record<string, unknown>): NotificationGroupSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    group_type: row.group_type as NotificationGroup["group_type"],
    status: row.status as NotificationGroup["status"],
    is_system_group: Boolean(row.is_system_group),
  };
}

export async function areNotificationGroupNestingTablesAvailable(
  client?: SupabaseClient,
): Promise<boolean> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase
    .from("notification_group_nestings")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  return isMissingNestingTable(error.message);
}

export async function listActiveNestingEdges(
  churchId: string,
  client?: SupabaseClient,
): Promise<NestingEdge[]> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("notification_group_nestings")
    .select("parent_group_id, child_group_id")
    .eq("church_id", churchId)
    .eq("status", "active");

  if (error) {
    if (isMissingNestingTable(error.message)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{
    parent_group_id: string;
    child_group_id: string;
  }>).map((row) => ({
    parentGroupId: row.parent_group_id,
    childGroupId: row.child_group_id,
  }));
}

/**
 * BFS expansion of nested children. Includes the root.
 * Cycle-safe and depth-capped.
 */
export function expandGroupDescendantIds(
  rootGroupId: string,
  edges: NestingEdge[],
  maxDepth = NOTIFICATION_GROUP_MAX_NESTING_DEPTH,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const edge of edges) {
    const list = childrenByParent.get(edge.parentGroupId) ?? [];
    list.push(edge.childGroupId);
    childrenByParent.set(edge.parentGroupId, list);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [
    { id: rootGroupId, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    ordered.push(current.id);
    if (current.depth >= maxDepth) continue;
    for (const childId of childrenByParent.get(current.id) ?? []) {
      if (!seen.has(childId)) {
        queue.push({ id: childId, depth: current.depth + 1 });
      }
    }
  }

  return ordered;
}

/**
 * True when parent is already reachable from child (adding parent→child cycles).
 */
export function wouldCreateGroupNestingCycle(
  parentGroupId: string,
  childGroupId: string,
  edges: NestingEdge[],
  maxDepth = NOTIFICATION_GROUP_MAX_NESTING_DEPTH,
): boolean {
  if (parentGroupId === childGroupId) return true;
  const descendants = expandGroupDescendantIds(childGroupId, edges, maxDepth);
  return descendants.includes(parentGroupId);
}

export function validateGroupNesting(input: {
  parent: Pick<NotificationGroup, "id" | "church_id" | "status" | "is_system_group">;
  child: Pick<NotificationGroup, "id" | "church_id" | "status">;
  edges: NestingEdge[];
  maxDepth?: number;
}): { ok: true } | { ok: false; error: string } {
  const maxDepth = input.maxDepth ?? NOTIFICATION_GROUP_MAX_NESTING_DEPTH;

  if (input.parent.id === input.child.id) {
    return {
      ok: false,
      error:
        "This group cannot be added because it would create a circular group relationship.",
    };
  }

  if (input.parent.church_id !== input.child.church_id) {
    return { ok: false, error: "Nested groups must belong to the same church." };
  }

  if (input.parent.is_system_group) {
    return {
      ok: false,
      error: "System groups cannot contain nested groups.",
    };
  }

  if (input.parent.status === "archived") {
    return {
      ok: false,
      error: "Cannot add nested groups to an archived parent group.",
    };
  }

  if (input.child.status === "archived") {
    return { ok: false, error: "Archived groups cannot be nested." };
  }

  if (
    wouldCreateGroupNestingCycle(
      input.parent.id,
      input.child.id,
      input.edges,
      maxDepth,
    )
  ) {
    return {
      ok: false,
      error:
        "This group cannot be added because it would create a circular group relationship.",
    };
  }

  // Depth: ancestors of parent + 1 + subtree under child
  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  for (const edge of input.edges) {
    const parents = parentsByChild.get(edge.childGroupId) ?? [];
    parents.push(edge.parentGroupId);
    parentsByChild.set(edge.childGroupId, parents);
    const children = childrenByParent.get(edge.parentGroupId) ?? [];
    children.push(edge.childGroupId);
    childrenByParent.set(edge.parentGroupId, children);
  }

  let parentDepthFromRoots = 0;
  {
    const seen = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: input.parent.id, depth: 0 },
    ];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (seen.has(current.id)) continue;
      seen.add(current.id);
      parentDepthFromRoots = Math.max(parentDepthFromRoots, current.depth);
      if (current.depth >= maxDepth) continue;
      for (const parentId of parentsByChild.get(current.id) ?? []) {
        queue.push({ id: parentId, depth: current.depth + 1 });
      }
    }
  }

  let childSubtreeDepth = 0;
  {
    const seen = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [
      { id: input.child.id, depth: 0 },
    ];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (seen.has(current.id)) continue;
      seen.add(current.id);
      childSubtreeDepth = Math.max(childSubtreeDepth, current.depth);
      if (current.depth >= maxDepth) continue;
      for (const childId of childrenByParent.get(current.id) ?? []) {
        queue.push({ id: childId, depth: current.depth + 1 });
      }
    }
  }

  if (parentDepthFromRoots + 1 + childSubtreeDepth > maxDepth) {
    return {
      ok: false,
      error: `Nesting depth cannot exceed ${maxDepth} levels.`,
    };
  }

  const alreadyLinked = input.edges.some(
    (edge) =>
      edge.parentGroupId === input.parent.id &&
      edge.childGroupId === input.child.id,
  );
  if (alreadyLinked) {
    return {
      ok: false,
      error: "That group is already included.",
    };
  }

  return { ok: true };
}

export async function listDirectChildGroups(
  churchId: string,
  parentGroupId: string,
): Promise<NotificationGroupNestingSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_group_nestings")
    .select(
      "id, church_id, parent_group_id, child_group_id, status, added_by, added_at, removed_at, created_at, updated_at",
    )
    .eq("church_id", churchId)
    .eq("parent_group_id", parentGroupId)
    .eq("status", "active")
    .order("added_at", { ascending: false });

  if (error) {
    if (isMissingNestingTable(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) =>
    mapNesting(row as Record<string, unknown>),
  );
  if (rows.length === 0) return [];

  const childIds = rows.map((row) => row.child_group_id);
  const { data: groups } = await supabase
    .from("notification_groups")
    .select("id, name, description, group_type, status, is_system_group")
    .eq("church_id", churchId)
    .in("id", childIds);

  const byId = new Map(
    ((groups ?? []) as Record<string, unknown>[]).map((row) => [
      String(row.id),
      mapGroupSummary(row),
    ]),
  );

  return rows
    .map((row) => ({
      ...row,
      child_group: byId.get(row.child_group_id),
    }))
    .sort((a, b) =>
      (a.child_group?.name ?? "").localeCompare(b.child_group?.name ?? ""),
    );
}

export async function listDirectParentGroups(
  churchId: string,
  childGroupId: string,
): Promise<NotificationGroupNestingSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_group_nestings")
    .select(
      "id, church_id, parent_group_id, child_group_id, status, added_by, added_at, removed_at, created_at, updated_at",
    )
    .eq("church_id", churchId)
    .eq("child_group_id", childGroupId)
    .eq("status", "active")
    .order("added_at", { ascending: false });

  if (error) {
    if (isMissingNestingTable(error.message)) return [];
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) =>
    mapNesting(row as Record<string, unknown>),
  );
  if (rows.length === 0) return [];

  const parentIds = rows.map((row) => row.parent_group_id);
  const { data: groups } = await supabase
    .from("notification_groups")
    .select("id, name, description, group_type, status, is_system_group")
    .eq("church_id", churchId)
    .in("id", parentIds);

  const byId = new Map(
    ((groups ?? []) as Record<string, unknown>[]).map((row) => [
      String(row.id),
      mapGroupSummary(row),
    ]),
  );

  return rows
    .map((row) => ({
      ...row,
      parent_group: byId.get(row.parent_group_id),
    }))
    .sort((a, b) =>
      (a.parent_group?.name ?? "").localeCompare(b.parent_group?.name ?? ""),
    );
}

export async function addGroupToGroup(params: {
  supabase: SupabaseClient;
  churchId: string;
  parentGroupId: string;
  childGroupId: string;
  addedBy: string;
  parent: Pick<
    NotificationGroup,
    "id" | "church_id" | "status" | "is_system_group"
  >;
  child: Pick<NotificationGroup, "id" | "church_id" | "status">;
}): Promise<{ ok: true; nestingId: string } | { ok: false; error: string }> {
  const edges = await listActiveNestingEdges(params.churchId, params.supabase);
  const validation = validateGroupNesting({
    parent: params.parent,
    child: params.child,
    edges,
  });
  if (!validation.ok) return validation;

  const { data: existing } = await params.supabase
    .from("notification_group_nestings")
    .select("id, status")
    .eq("church_id", params.churchId)
    .eq("parent_group_id", params.parentGroupId)
    .eq("child_group_id", params.childGroupId)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; status: string };
    if (row.status === "active") {
      return { ok: false, error: "That group is already included." };
    }
    const { error } = await params.supabase
      .from("notification_group_nestings")
      .update({
        status: "active",
        removed_at: null,
        added_by: params.addedBy,
        added_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      return { ok: false, error: friendlyNestingError(error.message) };
    }
    return { ok: true, nestingId: row.id };
  }

  const { data, error } = await params.supabase
    .from("notification_group_nestings")
    .insert({
      church_id: params.churchId,
      parent_group_id: params.parentGroupId,
      child_group_id: params.childGroupId,
      status: "active",
      added_by: params.addedBy,
      removed_at: null,
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: friendlyNestingError(error.message) };
  }

  return { ok: true, nestingId: String((data as { id: string }).id) };
}

export async function removeGroupFromGroup(params: {
  supabase: SupabaseClient;
  churchId: string;
  parentGroupId: string;
  nestingId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await params.supabase
    .from("notification_group_nestings")
    .update({
      status: "removed",
      removed_at: new Date().toISOString(),
    })
    .eq("id", params.nestingId)
    .eq("church_id", params.churchId)
    .eq("parent_group_id", params.parentGroupId)
    .eq("status", "active");

  if (error) {
    if (isMissingNestingTable(error.message)) {
      return {
        ok: false,
        error:
          "Nested groups are not configured yet. Run supabase/migrations/039_notification_group_nesting.sql.",
      };
    }
    return { ok: false, error: friendlyNestingError(error.message) };
  }

  return { ok: true };
}

export function friendlyNestingError(message: string): string {
  if (/circular|VALIDATION: This group cannot be added/i.test(message)) {
    return "This group cannot be added because it would create a circular group relationship.";
  }
  if (/Nesting depth|exceed/i.test(message)) {
    return `Nesting depth cannot exceed ${NOTIFICATION_GROUP_MAX_NESTING_DEPTH} levels.`;
  }
  if (/System groups cannot contain/i.test(message)) {
    return "System groups cannot contain nested groups.";
  }
  if (/same church/i.test(message)) {
    return "Nested groups must belong to the same church.";
  }
  if (/Archived/i.test(message)) {
    return "Archived groups cannot be nested.";
  }
  if (/duplicate|unique/i.test(message)) {
    return "That group is already included.";
  }
  if (isMissingNestingTable(message)) {
    return "Nested groups are not configured yet. Run supabase/migrations/039_notification_group_nesting.sql.";
  }
  return message;
}

/** Build path names from root to leaf using parent pointers collected during walk. */
export function buildGroupPathNames(
  rootId: string,
  leafId: string,
  parentOf: Map<string, string>,
  nameById: Map<string, string>,
): string[] {
  if (rootId === leafId) {
    return [nameById.get(rootId) ?? "Group"];
  }
  const chain: string[] = [];
  let current: string | undefined = leafId;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    chain.push(nameById.get(current) ?? "Group");
    if (current === rootId) break;
    current = parentOf.get(current);
  }
  if (chain[chain.length - 1] !== (nameById.get(rootId) ?? "Group")) {
    chain.push(nameById.get(rootId) ?? "Group");
  }
  return chain.reverse();
}

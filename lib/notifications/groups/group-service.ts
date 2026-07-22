import { createClient } from "@/lib/supabase/server";
import {
  getNotificationGroup,
  listNotificationGroupDefaults,
  listNotificationGroupMembers,
  listNotificationGroups,
} from "@/lib/notifications/groups/queries";
import {
  listActiveNestingEdges,
  listDirectChildGroups,
  listDirectParentGroups,
  validateGroupNesting,
} from "@/lib/notifications/groups/nesting";
import {
  getEffectiveGroupUsers,
  getNotificationGroupCounts,
} from "@/lib/notifications/groups/membership-resolver";
import type {
  EffectiveGroupUser,
  NotificationGroup,
  NotificationGroupCounts,
  NotificationGroupDefault,
  NotificationGroupMember,
  NotificationGroupNestingSummary,
  NotificationGroupSummary,
} from "@/lib/notifications/groups/types";

/**
 * Stable detail payload for web and future mobile clients.
 * All authorization must still be enforced by the caller / RLS.
 */
export type GroupDetail = {
  id: string;
  name: string;
  description: string | null;
  group: NotificationGroup;
  directUsers: NotificationGroupMember[];
  included: NotificationGroupNestingSummary[];
  parents: NotificationGroupNestingSummary[];
  includedGroups: NotificationGroupSummary[];
  parentGroups: NotificationGroupSummary[];
  effectiveUsers: EffectiveGroupUser[];
  defaults: NotificationGroupDefault[];
  counts: NotificationGroupCounts;
  nestableGroupOptions: Array<{
    id: string;
    name: string;
    groupType: string;
    isSystemGroup: boolean;
    disabledReason: string | null;
  }>;
};

export async function getGroupDetail(
  churchId: string,
  groupId: string,
  options?: { includeEffectiveUsers?: boolean },
): Promise<GroupDetail | null> {
  const includeEffective = options?.includeEffectiveUsers !== false;
  const group = await getNotificationGroup(churchId, groupId);
  if (!group) return null;

  const supabase = await createClient();

  const [
    directUsers,
    includedRows,
    parentRows,
    defaults,
    counts,
    effectiveUsers,
    allGroups,
    edges,
  ] = await Promise.all([
    listNotificationGroupMembers(churchId, groupId),
    listDirectChildGroups(churchId, groupId),
    listDirectParentGroups(churchId, groupId),
    listNotificationGroupDefaults(churchId, groupId),
    getNotificationGroupCounts(churchId, group, { client: supabase }),
    includeEffective
      ? getEffectiveGroupUsers(churchId, groupId, { client: supabase })
      : Promise.resolve([] as EffectiveGroupUser[]),
    listNotificationGroups(churchId, { includeArchived: false }),
    listActiveNestingEdges(churchId, supabase),
  ]);

  const includedIds = new Set(includedRows.map((row) => row.child_group_id));
  const nestableGroupOptions = allGroups
    .filter((candidate) => candidate.id !== group.id)
    .map((candidate) => {
      let disabledReason: string | null = null;
      if (includedIds.has(candidate.id)) {
        disabledReason = "Already included";
      } else if (group.is_system_group) {
        disabledReason = "System groups cannot contain nested groups.";
      } else {
        const validation = validateGroupNesting({
          parent: group,
          child: candidate,
          edges,
        });
        if (!validation.ok) disabledReason = validation.error;
      }
      return {
        id: candidate.id,
        name: candidate.name,
        groupType: candidate.group_type,
        isSystemGroup: candidate.is_system_group,
        disabledReason,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    group,
    directUsers,
    included: includedRows,
    parents: parentRows,
    includedGroups: includedRows
      .map((row) => row.child_group)
      .filter((row): row is NotificationGroupSummary => Boolean(row)),
    parentGroups: parentRows
      .map((row) => row.parent_group)
      .filter((row): row is NotificationGroupSummary => Boolean(row)),
    effectiveUsers,
    defaults,
    counts,
    nestableGroupOptions,
  };
}

export async function isUserEffectiveGroupMember(params: {
  churchId: string;
  groupId: string;
  userId: string;
}): Promise<boolean> {
  const users = await getEffectiveGroupUsers(params.churchId, params.groupId);
  return users.some((user) => user.userId === params.userId);
}

export type {
  NotificationGroupNestingSummary,
  EffectiveGroupUser,
  NotificationGroupCounts,
};

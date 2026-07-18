import type { MembershipRole } from "@/lib/church/types";
import { hasMinRole } from "@/lib/church/navigation";
import { OPERATIONAL_GROUP_TYPES } from "@/lib/notifications/groups/constants";
import type { NotificationGroupType } from "@/lib/notifications/groups/types";

export function canViewNotificationGroups(role: MembershipRole): boolean {
  return hasMinRole(role, "security_member");
}

export function canManageAllNotificationGroups(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canManageOperationalNotificationGroups(
  role: MembershipRole,
): boolean {
  return hasMinRole(role, "security_leader");
}

export function canManageNotificationGroup(
  role: MembershipRole,
  groupType: NotificationGroupType,
  isSystemGroup: boolean,
): boolean {
  if (isSystemGroup) {
    return canManageAllNotificationGroups(role);
  }
  if (OPERATIONAL_GROUP_TYPES.has(groupType)) {
    return canManageOperationalNotificationGroups(role);
  }
  return canManageAllNotificationGroups(role);
}

export function canCreateNotificationGroup(
  role: MembershipRole,
  groupType: NotificationGroupType,
): boolean {
  return canManageNotificationGroup(role, groupType, false);
}

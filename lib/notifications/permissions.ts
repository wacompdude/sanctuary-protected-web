import type { MembershipRole } from "@/lib/church/types";
import { hasMinRole } from "@/lib/church/navigation";

export function canViewOwnNotifications(role: MembershipRole | null): boolean {
  return role != null;
}

export function canManageNotificationPreferences(
  role: MembershipRole | null,
): boolean {
  return role != null;
}

export function canViewNotificationHistory(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

export function canManageChurchNotificationSettings(
  role: MembershipRole,
): boolean {
  return hasMinRole(role, "administrator");
}

export function canManageNotificationTemplates(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

export function canCreateOperationalNotifications(
  role: MembershipRole,
): boolean {
  return hasMinRole(role, "security_leader");
}

export function canSendTestNotification(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canRetryNotificationDelivery(role: MembershipRole): boolean {
  return hasMinRole(role, "administrator");
}

export function canViewRecipientDeliveryDetails(
  role: MembershipRole,
  isSelf: boolean,
): boolean {
  return isSelf || canViewNotificationHistory(role);
}

export type { NotificationProvider } from "@/lib/notifications/providers/provider-interface";
export { getEmailProvider, getEmailProviderStatus } from "@/lib/notifications/providers/email-provider";
export {
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  acknowledgeNotification,
  cancelNotification,
} from "@/lib/notifications/create-notification";
export {
  dispatchPendingDeliveries,
  sendEmailDelivery,
  retryFailedDelivery,
} from "@/lib/notifications/dispatch-notification";
export {
  resolveUsersByChurchRole,
  resolveUsersByIds,
  resolveIncidentNotificationRecipients,
  applyRecipientPreferences,
  dedupeRecipients,
} from "@/lib/notifications/resolve-recipients";
export {
  resolveNotificationAudience,
  resolveGroupMembers,
  resolveSystemGroupIdsForRoles,
} from "@/lib/notifications/resolve-audience";
export type {
  NotificationTargetInput,
  AudienceMember,
  PlannedDelivery,
} from "@/lib/notifications/resolve-audience";
export {
  renderNotificationTemplate,
  wrapEmailHtml,
} from "@/lib/notifications/render-template";
export {
  getChurchNotificationSettings,
  getNotificationTemplate,
} from "@/lib/notifications/settings";
export {
  listUserNotifications,
  countUnreadNotifications,
  areNotificationTablesAvailable,
} from "@/lib/notifications/queries";
export type { UserNotificationListItem } from "@/lib/notifications/queries";
export * from "@/lib/notifications/types";
export * from "@/lib/notifications/constants";
export * from "@/lib/notifications/permissions";
export * from "@/lib/notifications/groups/permissions";
export * from "@/lib/notifications/groups/constants";
export type {
  NotificationGroup,
  NotificationGroupListItem,
  NotificationGroupMember,
  NotificationGroupDefault,
} from "@/lib/notifications/groups/types";
export type { NotificationEndpoint } from "@/lib/notifications/endpoints/types";
export { maskDestination } from "@/lib/notifications/endpoints/normalize";

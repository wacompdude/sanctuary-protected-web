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
} from "@/lib/notifications/resolve-recipients";
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

export type {
  EmailSenderCategory,
  EmailSenderConfiguration,
} from "@/lib/email/email-sender-types";
export {
  EMAIL_SENDER_CATEGORIES,
  EMAIL_SENDER_LABELS,
  isEmailSenderCategory,
} from "@/lib/email/email-sender-types";
export {
  getEmailSenders,
  listEmailSenderConfigurations,
  isEmailSenderSystemConfigured,
  isEmailProviderApiConfigured,
  buildEmailSenderForCategory,
  extractEmailAddress,
} from "@/lib/email/email-senders";
export {
  resolveEmailSender,
  formatResolvedEmailSender,
  formatEmailSender,
} from "@/lib/email/resolve-email-sender";
export {
  resolveSenderForNotification,
  mapNotificationTypeToSenderCategory,
  NOTIFICATION_SENDER_CATEGORY_MAP,
  EMERGENCY_ELIGIBLE_NOTIFICATION_TYPES,
} from "@/lib/email/notification-sender-map";
export {
  EmailSenderConfigError,
  getApprovedEmailDomain,
  assertApprovedSenderAddress,
  assertSafeHeaderValue,
} from "@/lib/email/validate-email-sender";
export {
  getEmailSenderRegistryStatus,
} from "@/lib/email/sender-registry-status";
export type {
  EmailSenderStatusRow,
  EmailSenderRegistryStatus,
} from "@/lib/email/sender-registry-status";
export { verifyResendWebhookSignature } from "@/lib/email/verify-resend-webhook";

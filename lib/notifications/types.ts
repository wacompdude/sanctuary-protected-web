import type { MembershipRole } from "@/lib/church/types";

export const NOTIFICATION_CHANNELS = ["email", "sms", "push", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_SEVERITIES = [
  "informational",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_STATUSES = [
  "draft",
  "pending",
  "queued",
  "processing",
  "partially_sent",
  "sent",
  "failed",
  "cancelled",
  "expired",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "pending",
  "queued",
  "processing",
  "delivered",
  "sent",
  "failed",
  "bounced",
  "rejected",
  "cancelled",
  "suppressed",
  "expired",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DIGEST_FREQUENCIES = [
  "immediate",
  "hourly",
  "daily",
  "weekly",
  "never",
] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export const RECIPIENT_TYPES = [
  "user",
  "email_address",
  "role",
  "team",
  "campus",
  "church",
] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export type NotificationType =
  | "incident.created"
  | "incident.critical"
  | "incident.updated"
  | "incident.resolved"
  | "incident.assigned"
  | "incident.reopened"
  | "incident.follow_up_required"
  | "incident.acknowledgment_requested"
  | "certification.expiring"
  | "certification.expired"
  | "certification.renewed"
  | "certification.missing_required"
  | "equipment.maintenance_due"
  | "equipment.out_of_service"
  | "equipment.inspection_due"
  | "equipment.warranty_expiring"
  | "equipment.replacement_approaching"
  | "equipment.sensor_stopped"
  | "equipment.camera_verification_overdue"
  | "membership.invited"
  | "membership.invitation_accepted"
  | "membership.suspended"
  | "membership.restored"
  | "membership.role_changed"
  | "membership.access_removed"
  | "admin.trial_expiring"
  | "admin.account_suspended"
  | "admin.delivery_failed"
  | "admin.daily_summary"
  | "admin.weekly_summary"
  | "admin.config_warning"
  | "notification.test";

export type ChurchNotificationSettings = {
  id: string;
  church_id: string;
  default_sender_name: string | null;
  reply_to_email: string | null;
  email_notifications_enabled: boolean;
  sms_notifications_enabled: boolean;
  push_notifications_enabled: boolean;
  critical_alert_override_enabled: boolean;
  default_incident_notification_roles: string[];
  default_critical_notification_roles: string[];
  certification_warning_days: number;
  maintenance_warning_days: number;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  weekly_digest_enabled: boolean;
  weekly_digest_day: number;
  weekly_digest_time: string;
  timezone: string;
  max_email_attempts: number;
};

export type NotificationTemplate = {
  id: string;
  church_id: string | null;
  template_key: string;
  name: string;
  description: string | null;
  channel: NotificationChannel;
  subject_template: string;
  body_text_template: string;
  body_html_template: string | null;
  severity: NotificationSeverity;
  is_system_template: boolean;
  is_active: boolean;
  version: number;
  allowed_variables: string[];
};

export type ResolvedRecipient = {
  userId: string;
  membershipId: string | null;
  email: string | null;
  displayName: string;
  role: MembershipRole | null;
  emailVerified: boolean;
};

export type CreateNotificationInput = {
  churchId: string;
  campusId?: string | null;
  createdBy?: string | null;
  notificationType: NotificationType | string;
  severity?: NotificationSeverity;
  title?: string;
  body?: string;
  summary?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  requiresAcknowledgment?: boolean;
  acknowledgmentDeadline?: string | null;
  expiresAt?: string | null;
  scheduledFor?: string | null;
  deduplicationKey?: string | null;
  metadata?: Record<string, unknown> | null;
  templateKey?: string | null;
  templateVariables?: Record<string, string | number | null | undefined>;
  /** Explicit user IDs; if omitted, roles from church settings are used when applicable. */
  recipientUserIds?: string[];
  /** Roles to resolve when recipientUserIds not provided. */
  recipientRoles?: MembershipRole[];
  channels?: NotificationChannel[];
  /** Skip email even if enabled (in-app only). */
  emailOnlyToVerified?: boolean;
};

export type CreateNotificationResult = {
  notificationId: string | null;
  status: NotificationStatus | "duplicate" | "skipped";
  recipientCount: number;
  deliveryCount: number;
  error?: string;
};

export type NotificationMessage = {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  replyTo?: string | null;
  tags?: Record<string, string>;
};

export type NotificationSendResult = {
  ok: boolean;
  providerMessageId?: string | null;
  status: DeliveryStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerResponse?: Record<string, unknown> | null;
};

import type {
  NotificationChannel,
  NotificationSeverity,
  NotificationType,
} from "@/lib/notifications/types";

export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const EMAIL_SUBJECT_PREFIX: Record<NotificationSeverity, string> = {
  informational: "",
  low: "",
  medium: "",
  high: "[HIGH] ",
  critical: "[CRITICAL] ",
};

/** Types that may bypass quiet hours / routine preference opt-outs when church override is on. */
export const CRITICAL_OVERRIDE_TYPES: ReadonlySet<string> = new Set([
  "incident.critical",
  "admin.account_suspended",
]);

export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "in_app",
  "email",
];

export function isNotificationSeverity(
  value: string,
): value is NotificationSeverity {
  return (
    value === "informational" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  );
}

export function isNotificationChannel(
  value: string,
): value is NotificationChannel {
  return (
    value === "email" ||
    value === "sms" ||
    value === "push" ||
    value === "in_app"
  );
}

export function severityAtLeast(
  value: NotificationSeverity,
  minimum: NotificationSeverity,
): boolean {
  return SEVERITY_RANK[value] >= SEVERITY_RANK[minimum];
}

export function mapIncidentSeverityToNotification(
  incidentSeverity: string,
): NotificationSeverity {
  switch (incidentSeverity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "informational";
  }
}

export function templateKeyForNotificationType(
  notificationType: NotificationType | string,
): string {
  return notificationType;
}

export function labelForNotificationType(type: string): string {
  const labels: Record<string, string> = {
    "incident.created": "Incident created",
    "incident.critical": "Critical incident",
    "incident.updated": "Incident updated",
    "incident.resolved": "Incident resolved",
    "certification.expiring": "Certification expiring",
    "certification.expired": "Certification expired",
    "equipment.maintenance_due": "Equipment maintenance due",
    "equipment.out_of_service": "Equipment out of service",
    "membership.invited": "Team invitation",
    "membership.role_changed": "Role changed",
    "general.announcement": "Announcement",
    "emergency.alert": "Emergency alert",
    "notification.test": "Test notification",
    "policy.published": "Policy published",
    "policy.acknowledgment_required": "Policy acknowledgment required",
  };
  return labels[type] ?? type;
}

export function getNotificationAppOrigin(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

import { SMS_BRAND_NAME } from "@/lib/legal/config";
import {
  EMAIL_SUBJECT_PREFIX,
  isNotificationSeverity,
  labelForNotificationType,
} from "@/lib/notifications/constants";
import { estimateSmsSegments } from "@/lib/subscriptions/sms-segments";

const DETAILS = " Open Sanctuary Protected for details.";

function compactHeadline(title: string, notificationType?: string | null): string {
  const trimmed = title.replace(/\s+/g, " ").trim();
  if (trimmed && trimmed.length <= 80) return trimmed.replace(/[.]+$/, "");
  const labeled = labelForNotificationType(notificationType ?? "");
  if (labeled && labeled !== notificationType) return labeled;
  if (trimmed) return `${trimmed.slice(0, 77).trim()}…`;
  return "Notification";
}

/**
 * Concise application SMS. Does not include incident body, medical detail,
 * or private notes. Directs the recipient into Sanctuary Protected.
 */
export function formatApplicationNotificationSms(input: {
  title: string;
  severity?: string | null;
  notificationType?: string | null;
}): string {
  const severityPrefix =
    input.severity && isNotificationSeverity(input.severity)
      ? EMAIL_SUBJECT_PREFIX[input.severity]
      : "";
  const headline = compactHeadline(input.title, input.notificationType);
  let text = `${SMS_BRAND_NAME}: ${severityPrefix}${headline}.${DETAILS}`;
  text = text.replace(/\s+/g, " ").trim();
  if (estimateSmsSegments(text) > 2) {
    const short =
      labelForNotificationType(input.notificationType ?? "") || "Notification";
    text = `${SMS_BRAND_NAME}: ${severityPrefix}${short}.${DETAILS}`;
  }
  return text.replace(/\s+/g, " ").trim();
}

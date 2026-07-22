export const EMAIL_SENDER_CATEGORIES = [
  "alerts",
  "no_reply",
  "info",
  "emergency",
  "incidents",
  "access",
  "support",
  "billing",
  "hardware",
] as const;

export type EmailSenderCategory = (typeof EMAIL_SENDER_CATEGORIES)[number];

export type EmailSenderConfiguration = {
  category: EmailSenderCategory;
  name: string;
  address: string;
  replyTo?: string;
  allowReplies: boolean;
  description: string;
  /** True when resolved from legacy EMAIL_FROM_ADDRESS fallback. */
  usedLegacyFallback?: boolean;
  /** True when the notification-type map had no entry and alerts was used. */
  usedCategoryFallback?: boolean;
};

export const EMAIL_SENDER_LABELS: Record<EmailSenderCategory, string> = {
  alerts: "General Alerts",
  no_reply: "No Reply",
  info: "General Information",
  emergency: "Emergency",
  incidents: "Incidents",
  access: "Account and Access",
  support: "Support",
  billing: "Billing",
  hardware: "Hardware",
};

export function isEmailSenderCategory(
  value: string,
): value is EmailSenderCategory {
  return (EMAIL_SENDER_CATEGORIES as readonly string[]).includes(value);
}

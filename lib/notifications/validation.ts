import {
  isNotificationChannel,
  isNotificationSeverity,
} from "@/lib/notifications/constants";
import type {
  CreateNotificationInput,
  NotificationChannel,
  NotificationSeverity,
} from "@/lib/notifications/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function sanitizeNotificationMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input) return {};
  const blocked =
    /(password|secret|token|api[_-]?key|credential|alarm|camera.?pass|access.?code)/i;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (blocked.test(key)) continue;
    if (typeof value === "string") {
      result[key] = value.slice(0, 500);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.slice(0, 20).map((item) =>
        typeof item === "string" ? item.slice(0, 200) : item,
      );
    }
  }
  return result;
}

export function validateCreateNotificationInput(
  input: CreateNotificationInput,
): { error?: string; severity?: NotificationSeverity; channels?: NotificationChannel[] } {
  if (!isUuid(input.churchId)) {
    return { error: "A valid church is required." };
  }
  if (!input.notificationType?.trim()) {
    return { error: "Notification type is required." };
  }
  if (input.notificationType.length > 120) {
    return { error: "Notification type is too long." };
  }

  const severity = input.severity ?? "informational";
  if (!isNotificationSeverity(severity)) {
    return { error: "Select a valid severity." };
  }

  const channels = input.channels ?? ["in_app", "email"];
  for (const channel of channels) {
    if (!isNotificationChannel(channel)) {
      return { error: "Unsupported notification channel." };
    }
  }

  if (input.title && input.title.length > 500) {
    return { error: "Title is too long." };
  }
  if (input.body && input.body.length > 20000) {
    return { error: "Body is too long." };
  }
  if (input.actionUrl && input.actionUrl.length > 2000) {
    return { error: "Action URL is too long." };
  }
  if (input.actionUrl) {
    const url = input.actionUrl.trim();
    if (
      !url.startsWith("/") &&
      !url.startsWith("http://") &&
      !url.startsWith("https://")
    ) {
      return { error: "Action URL must be a relative path or https URL." };
    }
  }
  if (input.deduplicationKey && input.deduplicationKey.length > 500) {
    return { error: "Deduplication key is too long." };
  }
  if (input.entityId && !isUuid(input.entityId)) {
    return { error: "Entity ID must be a valid UUID." };
  }
  if (input.campusId && !isUuid(input.campusId)) {
    return { error: "Campus ID must be a valid UUID." };
  }

  return { severity, channels };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeErrorMessage(message: string | null | undefined): string {
  if (!message) return "Delivery failed.";
  const cleaned = message.replace(/\s+/g, " ").trim().slice(0, 240);
  if (/api[_-]?key|authorization|bearer|secret/i.test(cleaned)) {
    return "Delivery failed due to a provider configuration error.";
  }
  return cleaned || "Delivery failed.";
}

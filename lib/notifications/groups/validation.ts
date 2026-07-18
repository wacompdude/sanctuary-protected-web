import { isNotificationSeverity } from "@/lib/notifications/constants";
import type { NotificationSeverity } from "@/lib/notifications/types";
import type {
  NotificationGroupStatus,
  NotificationGroupType,
} from "@/lib/notifications/groups/types";

const GROUP_TYPES = new Set([
  "security",
  "medical",
  "leadership",
  "ministry",
  "facilities",
  "campus",
  "emergency",
  "custom",
]);

const GROUP_STATUSES = new Set(["active", "inactive", "archived"]);

export function parseGroupType(
  value: FormDataEntryValue | null,
): NotificationGroupType | null {
  const raw = String(value ?? "").trim();
  return GROUP_TYPES.has(raw) ? (raw as NotificationGroupType) : null;
}

export function parseGroupStatus(
  value: FormDataEntryValue | null,
): NotificationGroupStatus | null {
  const raw = String(value ?? "").trim();
  return GROUP_STATUSES.has(raw) ? (raw as NotificationGroupStatus) : null;
}

export function parseGroupSeverity(
  value: FormDataEntryValue | null,
): NotificationSeverity | null {
  const raw = String(value ?? "").trim();
  return isNotificationSeverity(raw) ? raw : null;
}

export function parseGroupName(value: FormDataEntryValue | null): {
  name?: string;
  error?: string;
} {
  const name = String(value ?? "").trim();
  if (!name) return { error: "Group name is required." };
  if (name.length > 120) return { error: "Group name is too long." };
  return { name };
}

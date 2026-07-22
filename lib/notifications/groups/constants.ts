import type {
  NotificationGroupStatus,
  NotificationGroupType,
} from "@/lib/notifications/groups/types";

export const NOTIFICATION_GROUP_TYPES: {
  value: NotificationGroupType;
  label: string;
}[] = [
  { value: "security", label: "Security" },
  { value: "medical", label: "Medical" },
  { value: "leadership", label: "Leadership" },
  { value: "ministry", label: "Ministry" },
  { value: "facilities", label: "Facilities" },
  { value: "campus", label: "Campus" },
  { value: "emergency", label: "Emergency" },
  { value: "custom", label: "Custom" },
];

export const OPERATIONAL_GROUP_TYPES: ReadonlySet<NotificationGroupType> =
  new Set(["security", "emergency", "medical"]);

/** Shared with DB function notification_group_max_nesting_depth(). */
export const NOTIFICATION_GROUP_MAX_NESTING_DEPTH = 10;

export const NOTIFICATION_GROUP_STATUSES: {
  value: NotificationGroupStatus;
  label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

export function labelForGroupType(value: string): string {
  return (
    NOTIFICATION_GROUP_TYPES.find((item) => item.value === value)?.label ??
    value
  );
}

export function labelForGroupStatus(value: string): string {
  return (
    NOTIFICATION_GROUP_STATUSES.find((item) => item.value === value)?.label ??
    value
  );
}

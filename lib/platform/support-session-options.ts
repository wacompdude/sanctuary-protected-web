import type { PlatformAccessSessionType } from "@/lib/platform/types";

export const SUPPORT_SESSION_DURATION_OPTIONS = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
] as const;

export const SUPPORT_SESSION_ACCESS_TYPES: Array<{
  value: PlatformAccessSessionType;
  label: string;
  description: string;
}> = [
  {
    value: "read_only",
    label: "Read only",
    description: "View church configuration and records in the platform console.",
  },
  {
    value: "support",
    label: "Support",
    description: "Assisted troubleshooting within the church support workspace.",
  },
  {
    value: "administrative",
    label: "Administrative",
    description: "Elevated support review (requires church update permission).",
  },
  {
    value: "emergency",
    label: "Emergency",
    description: "Break-glass session (requires super-admin manage permission).",
  },
];

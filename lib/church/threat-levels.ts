import type { MembershipRole } from "@/lib/church/types";

export const THREAT_LEVEL_OPTIONS = [
  { value: "green", label: "Green", rankLabel: "Lowest" },
  { value: "blue", label: "Blue", rankLabel: "Second lowest" },
  { value: "yellow", label: "Yellow", rankLabel: "Middle" },
  { value: "orange", label: "Orange", rankLabel: "Second highest" },
  { value: "red", label: "Red", rankLabel: "Highest" },
] as const;

export type ThreatLevel = (typeof THREAT_LEVEL_OPTIONS)[number]["value"];

export type ChurchThreatLevelRecord = {
  id: string;
  church_id: string;
  week_start: string;
  threat_level: ThreatLevel;
  changed_by: string;
  created_at: string;
};

export type ChurchThreatLevelHistoryEntry = ChurchThreatLevelRecord & {
  changed_by_name: string;
  changed_by_email: string | null;
};

export function canManageThreatLevels(role: MembershipRole): boolean {
  return (
    role === "owner" ||
    role === "administrator" ||
    role === "security_leader"
  );
}

export function isThreatLevel(value: string): value is ThreatLevel {
  return THREAT_LEVEL_OPTIONS.some((option) => option.value === value);
}

export function labelForThreatLevel(value: ThreatLevel): string {
  return (
    THREAT_LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

export function rankLabelForThreatLevel(value: ThreatLevel): string {
  return (
    THREAT_LEVEL_OPTIONS.find((option) => option.value === value)?.rankLabel ?? ""
  );
}

export function threatLevelBadgeClassName(value: ThreatLevel): string {
  switch (value) {
    case "green":
      return "border-green-300 bg-green-100 text-green-900";
    case "blue":
      return "border-blue-300 bg-blue-200 text-blue-950";
    case "yellow":
      return "border-yellow-400/50 bg-yellow-300 text-yellow-950";
    case "orange":
      return "border-orange-300 bg-orange-200 text-orange-950";
    case "red":
      return "border-red-300 bg-red-200 text-red-950";
  }
}

export function startOfThreatWeek(date = new Date()): string {
  const local = new Date(date);
  const day = local.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() + diff);
  const offset = local.getTimezoneOffset();
  const normalized = new Date(local.getTime() - offset * 60_000);
  return normalized.toISOString().slice(0, 10);
}

export function normalizeThreatWeekInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfThreatWeek(parsed);
}

export function formatThreatWeek(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function threatLevelMigrationHintFromError(
  message: string,
): string | null {
  if (/church_threat_levels|does not exist|PGRST205|42P01/i.test(message)) {
    return "Threat level tracking is not configured yet. Run supabase/migrations/025_church_threat_levels.sql in the Supabase SQL Editor.";
  }
  return null;
}

import type { CSSProperties } from "react";
import type { MembershipRole } from "@/lib/church/types";

export const THREAT_LEVEL_OPTIONS = [
  { value: "green", label: "Green", rankLabel: "Lowest" },
  { value: "blue", label: "Blue", rankLabel: "Second lowest" },
  { value: "yellow", label: "Yellow", rankLabel: "Middle" },
  { value: "orange", label: "Orange", rankLabel: "Second highest" },
  { value: "red", label: "Red", rankLabel: "Highest" },
] as const;

export type ThreatLevel = (typeof THREAT_LEVEL_OPTIONS)[number]["value"];

export const THREAT_LEVEL_NOTES_MAX_LENGTH = 4000;

export type ChurchThreatLevelRecord = {
  id: string;
  church_id: string;
  week_start: string;
  threat_level: ThreatLevel;
  notes: string | null;
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

/** Shared layout classes only — colors come from threatLevelBadgeStyle. */
export function threatLevelBadgeClassName(_value?: ThreatLevel): string {
  void _value;
  return "inline-flex items-center rounded-md border px-3 py-1 text-sm font-bold uppercase tracking-wide";
}

/**
 * Explicit colors so theme/Badge variants cannot wash out the label
 * (e.g. white-on-white). Inline styles beat utility class conflicts.
 */
export function threatLevelBadgeStyle(
  value: ThreatLevel | string,
): CSSProperties {
  const level = String(value ?? "").trim().toLowerCase();

  switch (level) {
    case "green":
      return {
        backgroundColor: "#86efac",
        borderColor: "#16a34a",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#111111",
      };
    case "blue":
      return {
        backgroundColor: "#93c5fd",
        borderColor: "#2563eb",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#111111",
      };
    case "yellow":
      return {
        backgroundColor: "#fde047",
        borderColor: "#ca8a04",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#111111",
      };
    case "orange":
      return {
        backgroundColor: "#fdba74",
        borderColor: "#ea580c",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#111111",
      };
    case "red":
      return {
        backgroundColor: "#fca5a5",
        borderColor: "#dc2626",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#111111",
      };
    default:
      return {
        backgroundColor: "#e5e7eb",
        borderColor: "#9ca3af",
        borderStyle: "solid",
        borderWidth: "1px",
        color: "#111111",
      };
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
  if (/notes/i.test(message) && /church_threat_levels|column/i.test(message)) {
    return "Threat level notes are not configured yet. Run supabase/migrations/026_church_threat_level_notes.sql in the Supabase SQL Editor.";
  }
  if (/church_threat_levels|does not exist|PGRST205|42P01/i.test(message)) {
    return "Threat level tracking is not configured yet. Run supabase/migrations/025_church_threat_levels.sql (and 026_church_threat_level_notes.sql) in the Supabase SQL Editor.";
  }
  return null;
}

import { createClient } from "@/lib/supabase/server";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  threatLevelMigrationHintFromError,
  type ChurchThreatLevelHistoryEntry,
  type ChurchThreatLevelRecord,
} from "@/lib/church/threat-levels";

type ThreatLevelRow = {
  id: string;
  church_id: string;
  week_start: string;
  threat_level: ChurchThreatLevelRecord["threat_level"];
  changed_by: string;
  created_at: string;
};

async function mapThreatLevelHistory(
  churchId: string,
  rows: ThreatLevelRow[],
): Promise<ChurchThreatLevelHistoryEntry[]> {
  const memberships = await listChurchTeamMemberships(churchId).catch(() => []);
  const byUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  );

  return rows.map((row) => {
    const actor = byUserId.get(row.changed_by);
    return {
      ...row,
      changed_by_name: actor?.name ?? "Former team member",
      changed_by_email: actor?.email ?? null,
    };
  });
}

export async function listChurchThreatLevels(
  churchId: string,
  limit = 12,
): Promise<ChurchThreatLevelHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("church_threat_levels")
    .select("id, church_id, week_start, threat_level, changed_by, created_at")
    .eq("church_id", churchId)
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(threatLevelMigrationHintFromError(error.message) ?? error.message);
  }

  return mapThreatLevelHistory(churchId, (data ?? []) as ThreatLevelRow[]);
}

export async function getCurrentChurchThreatLevel(
  churchId: string,
): Promise<ChurchThreatLevelHistoryEntry | null> {
  const [current] = await listChurchThreatLevels(churchId, 1);
  return current ?? null;
}

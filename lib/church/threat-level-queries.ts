import { createClient } from "@/lib/supabase/server";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  threatLevelMigrationHintFromError,
  type ChurchThreatLevelHistoryEntry,
  type ChurchThreatLevelRecord,
} from "@/lib/church/threat-levels";

type ThreatLevelRow = {
  id: string;
  organization_id: string;
  week_start: string;
  threat_level: ChurchThreatLevelRecord["threat_level"];
  notes: string | null;
  changed_by: string;
  created_at: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

async function mapThreatLevelHistory(
  organizationId: string,
  rows: ThreatLevelRow[],
): Promise<ChurchThreatLevelHistoryEntry[]> {
  const memberships = await listChurchTeamMemberships(organizationId).catch(() => []);
  const byUserId = new Map(
    memberships.map((membership) => [membership.userId, membership]),
  );

  return rows.map((row) => {
    const actor = byUserId.get(row.changed_by);
    return {
      ...row,
      notes: row.notes ?? null,
      changed_by_name: actor?.name ?? "Former team member",
      changed_by_email: actor?.email ?? null,
    };
  });
}

export async function listChurchThreatLevels(
  organizationId: string,
  limit = 12,
): Promise<ChurchThreatLevelHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_threat_levels")
    .select(
      "id, organization_id, week_start, threat_level, notes, changed_by, created_at, updated_at, updated_by",
    )
    .eq("organization_id", organizationId)
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // Older DBs may lack notes / updated_* columns.
    if (
      /(notes|updated_at|updated_by)/i.test(error.message) &&
      /column|does not exist/i.test(error.message)
    ) {
      const legacy = await supabase
        .from("organization_threat_levels")
        .select("id, organization_id, week_start, threat_level, notes, changed_by, created_at")
        .eq("organization_id", organizationId)
        .order("week_start", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (legacy.error) {
        // Fall further back without notes.
        if (/notes/i.test(legacy.error.message)) {
          const older = await supabase
            .from("organization_threat_levels")
            .select(
              "id, organization_id, week_start, threat_level, changed_by, created_at",
            )
            .eq("organization_id", organizationId)
            .order("week_start", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(limit);

          if (older.error) {
            throw new Error(
              threatLevelMigrationHintFromError(older.error.message) ??
                older.error.message,
            );
          }

          return mapThreatLevelHistory(
            organizationId,
            ((older.data ?? []) as Omit<ThreatLevelRow, "notes">[]).map(
              (row) => ({
                ...row,
                notes: null,
                updated_at: null,
                updated_by: null,
              }),
            ),
          );
        }

        throw new Error(
          threatLevelMigrationHintFromError(legacy.error.message) ??
            legacy.error.message,
        );
      }

      return mapThreatLevelHistory(
        organizationId,
        ((legacy.data ?? []) as ThreatLevelRow[]).map((row) => ({
          ...row,
          notes: row.notes ?? null,
          updated_at: null,
          updated_by: null,
        })),
      );
    }

    throw new Error(
      threatLevelMigrationHintFromError(error.message) ?? error.message,
    );
  }

  return mapThreatLevelHistory(organizationId, (data ?? []) as ThreatLevelRow[]);
}

export async function getCurrentChurchThreatLevel(
  organizationId: string,
): Promise<ChurchThreatLevelHistoryEntry | null> {
  const [current] = await listChurchThreatLevels(organizationId, 1);
  return current ?? null;
}

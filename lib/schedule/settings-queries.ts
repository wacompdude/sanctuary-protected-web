import { createClient } from "@/lib/supabase/server";
import {
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import type {
  ChurchScheduleSettings,
  ScheduleTemplate,
  ScheduleTemplateShiftDefinition,
} from "@/lib/schedule/types";

function isMissingRelation(message: string): boolean {
  return Boolean(scheduleMigrationHintFromError(message));
}

function mapTemplate(row: Record<string, unknown>): ScheduleTemplate {
  const defs = Array.isArray(row.default_shift_definitions)
    ? (row.default_shift_definitions as ScheduleTemplateShiftDefinition[])
    : [];
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    campus_id: (row.campus_id as string | null) ?? null,
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    event_type: row.event_type as ScheduleTemplate["event_type"],
    default_duration_minutes: Number(row.default_duration_minutes ?? 120),
    default_location: (row.default_location as string | null) ?? null,
    default_shift_definitions: defs,
    default_required_group_ids: Array.isArray(row.default_required_group_ids)
      ? (row.default_required_group_ids as string[])
      : [],
    default_notification_settings:
      row.default_notification_settings &&
      typeof row.default_notification_settings === "object"
        ? (row.default_notification_settings as Record<string, unknown>)
        : {},
    is_active: Boolean(row.is_active),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function ensureChurchScheduleSettings(
  churchId: string,
  timezone?: string | null,
): Promise<ChurchScheduleSettings | null> {
  const existing = await getTypedChurchScheduleSettings(churchId);
  if (existing) return existing;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("church_schedule_settings")
      .upsert(
        {
          church_id: churchId,
          timezone: timezone?.trim() || "America/Los_Angeles",
        },
        { onConflict: "church_id" },
      )
      .select("*")
      .single();
    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    return data as ChurchScheduleSettings;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

export async function getTypedChurchScheduleSettings(
  churchId: string,
): Promise<ChurchScheduleSettings | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("church_schedule_settings")
      .select("*")
      .eq("church_id", churchId)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    return (data as ChurchScheduleSettings | null) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

export async function listScheduleTemplates(
  churchId: string,
  options?: { includeInactive?: boolean },
): Promise<{
  items: ScheduleTemplate[];
  tablesAvailable: boolean;
  hint?: string;
}> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("schedule_templates")
      .select("*")
      .eq("church_id", churchId)
      .order("name", { ascending: true });
    if (!options?.includeInactive) {
      query = query.eq("is_active", true);
    }
    const { data, error } = await query;
    if (error) {
      if (isMissingRelation(error.message)) {
        return {
          items: [],
          tablesAvailable: false,
          hint: SCHEDULE_MIGRATION_HINT,
        };
      }
      throw new Error(error.message);
    }
    return {
      items: (data ?? []).map((row) =>
        mapTemplate(row as Record<string, unknown>),
      ),
      tablesAvailable: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) {
      return {
        items: [],
        tablesAvailable: false,
        hint: SCHEDULE_MIGRATION_HINT,
      };
    }
    throw error;
  }
}

export async function getScheduleTemplate(
  churchId: string,
  templateId: string,
): Promise<ScheduleTemplate | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schedule_templates")
      .select("*")
      .eq("church_id", churchId)
      .eq("id", templateId)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error.message)) return null;
      throw new Error(error.message);
    }
    if (!data) return null;
    return mapTemplate(data as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelation(message)) return null;
    throw error;
  }
}

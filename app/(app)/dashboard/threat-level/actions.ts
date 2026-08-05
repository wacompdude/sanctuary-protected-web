"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/organization/auth";
import {
  canManageThreatLevels,
  isThreatLevel,
  normalizeThreatWeekInput,
  normalizeWeekStartsOn,
  THREAT_LEVEL_NOTES_MAX_LENGTH,
  threatLevelMigrationHintFromError,
} from "@/lib/organization/threat-levels";
import type { ActionState } from "@/lib/organization/types";
import {
  auditChurchThreatLevelDeleted,
  auditChurchThreatLevelEdited,
  auditChurchThreatLevelUpdated,
} from "@/lib/audit/church-events";

function revalidateThreatPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/threat-level");
  revalidatePath("/dashboard/threat-level/history");
  revalidatePath("/dashboard/threat-level/history/calendar");
  revalidatePath("/", "layout");
}

/** Create a new weekly threat level history entry (append). */
export async function updateChurchThreatLevel(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (!canManageThreatLevels(membership.role)) {
      return {
        error:
          "You do not have permission to change the weekly church threat level.",
      };
    }

    const threatLevel = String(formData.get("threat_level") ?? "")
      .trim()
      .toLowerCase();
    const weekInput = String(formData.get("week_start") ?? "").trim();
    const weekStartsOn = normalizeWeekStartsOn(church.week_starts_on);
    const weekStart = normalizeThreatWeekInput(weekInput, weekStartsOn);
    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw ? notesRaw : null;
    const fieldErrors: Record<string, string> = {};

    if (!isThreatLevel(threatLevel)) {
      fieldErrors.threat_level = "Select a valid threat level.";
    }
    if (!weekStart) {
      fieldErrors.week_start = "Choose a valid week.";
    }
    if (notes && notes.length > THREAT_LEVEL_NOTES_MAX_LENGTH) {
      fieldErrors.notes = `Notes must be ${THREAT_LEVEL_NOTES_MAX_LENGTH} characters or fewer.`;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors,
      };
    }
    const resolvedWeekStart = weekStart as string;

    const { data: previousRow, error: previousError } = await supabase
      .from("organization_threat_levels")
      .select("threat_level")
      .eq("organization_id", church.id)
      .eq("week_start", resolvedWeekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) {
      return {
        error:
          threatLevelMigrationHintFromError(previousError.message) ??
          previousError.message,
      };
    }

    const { data: inserted, error: insertError } = await supabase
      .from("organization_threat_levels")
      .insert({
        organization_id: church.id,
        week_start: resolvedWeekStart,
        threat_level: threatLevel,
        notes,
        changed_by: user.id,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return {
        error:
          threatLevelMigrationHintFromError(insertError?.message ?? "") ??
          insertError?.message ??
          "Unable to save the weekly threat level.",
      };
    }

    await auditChurchThreatLevelUpdated(supabase, {
      organizationId: church.id,
      userId: user.id,
      threatLevelId: inserted.id,
      weekStart: resolvedWeekStart,
      previousLevel: (previousRow?.threat_level as string | null) ?? null,
      nextLevel: threatLevel,
    });

    revalidateThreatPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update the weekly threat level.",
    };
  }
}

/** Edit an existing threat level row in place. */
export async function editChurchThreatLevelEntry(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (!canManageThreatLevels(membership.role)) {
      return {
        error:
          "You do not have permission to edit weekly church threat levels.",
      };
    }

    const entryId = String(formData.get("entry_id") ?? "").trim();
    const threatLevel = String(formData.get("threat_level") ?? "")
      .trim()
      .toLowerCase();
    const weekInput = String(formData.get("week_start") ?? "").trim();
    const weekStartsOn = normalizeWeekStartsOn(church.week_starts_on);
    const weekStart = normalizeThreatWeekInput(weekInput, weekStartsOn);
    const notesRaw = String(formData.get("notes") ?? "").trim();
    const notes = notesRaw ? notesRaw : null;
    const fieldErrors: Record<string, string> = {};

    if (!entryId) {
      return { error: "Threat level entry is required." };
    }
    if (!isThreatLevel(threatLevel)) {
      fieldErrors.threat_level = "Select a valid threat level.";
    }
    if (!weekStart) {
      fieldErrors.week_start = "Choose a valid week.";
    }
    if (notes && notes.length > THREAT_LEVEL_NOTES_MAX_LENGTH) {
      fieldErrors.notes = `Notes must be ${THREAT_LEVEL_NOTES_MAX_LENGTH} characters or fewer.`;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors,
      };
    }

    const { data: existing, error: loadError } = await supabase
      .from("organization_threat_levels")
      .select("id, week_start, threat_level, notes")
      .eq("id", entryId)
      .eq("organization_id", church.id)
      .maybeSingle();

    if (loadError) {
      return {
        error:
          threatLevelMigrationHintFromError(loadError.message) ??
          loadError.message,
      };
    }
    if (!existing) {
      return { error: "Threat level entry was not found." };
    }

    const resolvedWeekStart = weekStart as string;
    const { error: updateError } = await supabase
      .from("organization_threat_levels")
      .update({
        week_start: resolvedWeekStart,
        threat_level: threatLevel,
        notes,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", entryId)
      .eq("organization_id", church.id);

    if (updateError) {
      return {
        error:
          threatLevelMigrationHintFromError(updateError.message) ??
          updateError.message ??
          "Unable to edit the threat level entry.",
      };
    }

    await auditChurchThreatLevelEdited(supabase, {
      organizationId: church.id,
      userId: user.id,
      threatLevelId: entryId,
      weekStart: resolvedWeekStart,
      previousWeekStart: String(existing.week_start),
      previousLevel: (existing.threat_level as string | null) ?? null,
      nextLevel: threatLevel,
      previousNotes: (existing.notes as string | null) ?? null,
      nextNotes: notes,
    });

    revalidateThreatPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to edit the threat level entry.",
    };
  }
}

/** Delete a threat level entry. */
export async function deleteChurchThreatLevelEntry(
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (!canManageThreatLevels(membership.role)) {
      return {
        error:
          "You do not have permission to delete weekly church threat levels.",
      };
    }

    const entryId = String(formData.get("entry_id") ?? "").trim();
    if (!entryId) {
      return { error: "Threat level entry is required." };
    }

    const { data: existing, error: loadError } = await supabase
      .from("organization_threat_levels")
      .select("id, week_start, threat_level")
      .eq("id", entryId)
      .eq("organization_id", church.id)
      .maybeSingle();

    if (loadError) {
      return {
        error:
          threatLevelMigrationHintFromError(loadError.message) ??
          loadError.message,
      };
    }
    if (!existing) {
      return { error: "Threat level entry was not found." };
    }

    const { error: deleteError } = await supabase
      .from("organization_threat_levels")
      .delete()
      .eq("id", entryId)
      .eq("organization_id", church.id);

    if (deleteError) {
      return {
        error:
          threatLevelMigrationHintFromError(deleteError.message) ??
          deleteError.message ??
          "Unable to delete the threat level entry.",
      };
    }

    await auditChurchThreatLevelDeleted(supabase, {
      organizationId: church.id,
      userId: user.id,
      threatLevelId: entryId,
      weekStart: String(existing.week_start),
      threatLevel: String(existing.threat_level),
    });

    revalidateThreatPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to delete the threat level entry.",
    };
  }
}

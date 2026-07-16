"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/church/auth";
import {
  canManageThreatLevels,
  isThreatLevel,
  normalizeThreatWeekInput,
  threatLevelMigrationHintFromError,
} from "@/lib/church/threat-levels";
import type { ActionState } from "@/lib/church/types";
import { auditChurchThreatLevelUpdated } from "@/lib/audit/church-events";

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

    const threatLevel = String(formData.get("threat_level") ?? "").trim().toLowerCase();
    const weekInput = String(formData.get("week_start") ?? "").trim();
    const weekStart = normalizeThreatWeekInput(weekInput);
    const fieldErrors: Record<string, string> = {};

    if (!isThreatLevel(threatLevel)) {
      fieldErrors.threat_level = "Select a valid threat level.";
    }
    if (!weekStart) {
      fieldErrors.week_start = "Choose a valid week.";
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors,
      };
    }
    const resolvedWeekStart = weekStart as string;

    const { data: previousRow, error: previousError } = await supabase
      .from("church_threat_levels")
      .select("threat_level")
      .eq("church_id", church.id)
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
      .from("church_threat_levels")
      .insert({
        church_id: church.id,
        week_start: resolvedWeekStart,
        threat_level: threatLevel,
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
      churchId: church.id,
      userId: user.id,
      threatLevelId: inserted.id,
      weekStart: resolvedWeekStart,
      previousLevel: (previousRow?.threat_level as string | null) ?? null,
      nextLevel: threatLevel,
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/threat-level");
    revalidatePath("/", "layout");
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

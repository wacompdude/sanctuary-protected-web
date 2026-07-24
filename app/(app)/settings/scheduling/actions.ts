"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { scheduleMigrationHintFromError } from "@/lib/schedule/constants";
import { canManageScheduleSettings } from "@/lib/schedule/permissions";
import {
  ensureChurchScheduleSettings,
} from "@/lib/schedule/settings-queries";
import { validateScheduleSettingsForm } from "@/lib/schedule/settings-validation";
import type { ScheduleActionState } from "@/lib/schedule/types";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

export async function updateScheduleSettingsAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    if (!canManageScheduleSettings(membership.role)) {
      throw new ChurchAccessError(
        "You do not have permission to manage scheduling settings.",
      );
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.TEAM_SCHEDULING,
    });

    const validated = validateScheduleSettingsForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid settings.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const existing = await ensureChurchScheduleSettings(
      church.id,
      church.timezone,
    );
    if (!existing) {
      return {
        error:
          "Scheduling settings are unavailable. Apply migration 035 first.",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("church_schedule_settings")
      .update({
        ...validated.data,
        updated_by: user.id,
      })
      .eq("church_id", church.id);

    if (error) {
      return {
        error:
          scheduleMigrationHintFromError(error.message) ??
          "Unable to save scheduling settings.",
      };
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_SETTINGS_UPDATED,
      entityType: AuditEntityType.SCHEDULE_SETTINGS,
      entityId: existing.id,
      metadata: {
        timezone: validated.data.timezone,
        default_calendar_view: validated.data.default_calendar_view,
      },
      ipAddress,
    });

    revalidatePath("/settings/scheduling");
    revalidatePath("/schedule");
    revalidatePath("/schedule/calendar");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update scheduling settings.",
    };
  }
}

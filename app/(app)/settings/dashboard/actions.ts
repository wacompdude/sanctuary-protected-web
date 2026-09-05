"use server";

import { revalidatePath } from "next/cache";
import {
  auditDashboardBoxSettingReset,
  auditDashboardBoxSettingsResetAll,
  auditDashboardBoxSettingsUpdated,
  auditDashboardObsoleteKeysPurged,
} from "@/lib/audit/dashboard-events";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/organization/auth";
import type { ActionState } from "@/lib/organization/types";
import {
  assertCanManageDashboardCustomization,
  parseDashboardBoxKey,
  purgeObsoleteChurchDashboardBoxSettings,
  replaceChurchDashboardBoxSettings,
  resetAllChurchDashboardBoxSettings,
  resetChurchDashboardBoxSetting,
  upsertChurchDashboardDisplaySettings,
  validateDashboardSettingsUpdate,
} from "@/lib/dashboard";
import {
  countCustomizedDashboardSettings,
  rejectBrowserSubmittedOrganizationId,
  sanitizeDashboardActionError,
} from "@/lib/dashboard/security";
import { createClient } from "@/lib/supabase/server";

export type DashboardSettingsActionState = ActionState;

function revalidateDashboardPaths() {
  revalidatePath("/settings/dashboard");
  revalidatePath("/dashboard");
}

export async function saveDashboardBoxSettingsAction(
  _prev: DashboardSettingsActionState,
  formData: FormData,
): Promise<DashboardSettingsActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    assertCanManageDashboardCustomization(membership.role);
    rejectBrowserSubmittedOrganizationId(formData);

    const rawJson = String(formData.get("settings_json") ?? "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return { error: "Invalid dashboard settings payload." };
    }

    if (!Array.isArray(parsed)) {
      return { error: "Invalid dashboard settings payload." };
    }

    const rows = parsed.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        boxKey: String(row.boxKey ?? ""),
        isVisible: Boolean(row.isVisible),
        displayOrder: Number(row.displayOrder),
        backgroundColor: String(row.backgroundColor ?? ""),
        textColor: String(row.textColor ?? ""),
        useAutomaticTextColor: Boolean(row.useAutomaticTextColor),
      };
    });

    const validated = validateDashboardSettingsUpdate(rows);
    if (!validated.ok) {
      return {
        error: validated.error,
        fieldErrors: validated.fieldErrors,
      };
    }

    const sortByActiveCount =
      String(formData.get("sort_by_active_count") ?? "").trim() === "on";

    const supabase = await createClient();
    const result = await replaceChurchDashboardBoxSettings({
      supabase,
      organizationId: church.id,
      userId: user.id,
      settings: validated.settings,
    });
    if (!result.ok) {
      return { error: result.error };
    }

    const displayResult = await upsertChurchDashboardDisplaySettings({
      supabase,
      organizationId: church.id,
      userId: user.id,
      sortByActiveCount,
    });
    if (!displayResult.ok) {
      return { error: displayResult.error };
    }

    await auditDashboardBoxSettingsUpdated(supabase, {
      organizationId: church.id,
      userId: user.id,
      boxCount: validated.settings.length,
      visibleCount: validated.settings.filter((row) => row.isVisible).length,
      customizedCount: countCustomizedDashboardSettings(validated.settings),
      sortByActiveCount,
    });

    revalidateDashboardPaths();
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    console.error("saveDashboardBoxSettingsAction failed:", error);
    return {
      error: sanitizeDashboardActionError(
        error,
        "Unable to save dashboard settings.",
      ),
    };
  }
}

export async function resetDashboardBoxSettingAction(
  _prev: DashboardSettingsActionState,
  formData: FormData,
): Promise<DashboardSettingsActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    assertCanManageDashboardCustomization(membership.role);
    rejectBrowserSubmittedOrganizationId(formData);

    const boxKey = parseDashboardBoxKey(formData.get("box_key"));
    if (!boxKey) {
      return { error: "Unknown dashboard box." };
    }

    const supabase = await createClient();
    const result = await resetChurchDashboardBoxSetting({
      supabase,
      organizationId: church.id,
      boxKey,
    });
    if (!result.ok) {
      return { error: result.error };
    }

    await auditDashboardBoxSettingReset(supabase, {
      organizationId: church.id,
      userId: user.id,
      boxKey,
    });

    revalidateDashboardPaths();
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    console.error("resetDashboardBoxSettingAction failed:", error);
    return {
      error: sanitizeDashboardActionError(
        error,
        "Unable to reset dashboard box.",
      ),
    };
  }
}

export async function resetAllDashboardBoxSettingsAction(
  _prev: DashboardSettingsActionState,
  formData?: FormData,
): Promise<DashboardSettingsActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    assertCanManageDashboardCustomization(membership.role);
    if (formData) {
      rejectBrowserSubmittedOrganizationId(formData);
    }

    const supabase = await createClient();
    const result = await resetAllChurchDashboardBoxSettings({
      supabase,
      organizationId: church.id,
    });
    if (!result.ok) {
      return { error: result.error };
    }

    await auditDashboardBoxSettingsResetAll(supabase, {
      organizationId: church.id,
      userId: user.id,
    });

    revalidateDashboardPaths();
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    console.error("resetAllDashboardBoxSettingsAction failed:", error);
    return {
      error: sanitizeDashboardActionError(
        error,
        "Unable to reset dashboard settings.",
      ),
    };
  }
}

/** Manager-only cleanup of obsolete box_key rows for the active church. */
export async function purgeObsoleteDashboardBoxSettingsAction(): Promise<DashboardSettingsActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    assertCanManageDashboardCustomization(membership.role);

    const supabase = await createClient();
    const result = await purgeObsoleteChurchDashboardBoxSettings({
      supabase,
      organizationId: church.id,
    });
    if (!result.ok) {
      return { error: result.error };
    }

    if (result.purgedKeys.length > 0) {
      await auditDashboardObsoleteKeysPurged(supabase, {
        organizationId: church.id,
        userId: user.id,
        obsoleteKeys: result.purgedKeys,
      });
      revalidateDashboardPaths();
    }

    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    console.error("purgeObsoleteDashboardBoxSettingsAction failed:", error);
    return {
      error: sanitizeDashboardActionError(
        error,
        "Unable to clean up dashboard settings.",
      ),
    };
  }
}

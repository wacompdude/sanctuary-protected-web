import type { SupabaseClient } from "@supabase/supabase-js";
import { getDashboardBoxDefinition } from "@/lib/dashboard/dashboard-box-registry";
import {
  assertDashboardChurchId,
  collectObsoleteDashboardBoxKeys,
} from "@/lib/dashboard/security";
import { settingsMatchSystemDefault } from "@/lib/dashboard/validation";
import type {
  DashboardBoxKey,
  DashboardBoxSettingInput,
} from "@/lib/dashboard/types";

export async function replaceChurchDashboardBoxSettings(params: {
  supabase: SupabaseClient;
  churchId: string;
  userId: string;
  settings: DashboardBoxSettingInput[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const churchId = assertDashboardChurchId(params.churchId);
  const { supabase, userId, settings } = params;

  const purge = await purgeObsoleteChurchDashboardBoxSettings({
    supabase,
    churchId,
  });
  if (!purge.ok) {
    return purge;
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("dashboard_box_settings")
    .select("box_key")
    .eq("church_id", churchId);
  if (existingError) {
    return { ok: false, error: friendlyDashboardDbError(existingError.message) };
  }

  const existingKeys = new Set(
    ((existingRows ?? []) as Array<{ box_key: string }>).map(
      (row) => row.box_key,
    ),
  );

  const toInsert: Array<Record<string, unknown>> = [];
  const toUpdate: Array<Record<string, unknown>> = [];
  const toDeleteKeys: string[] = [];
  const keepKeys = new Set<DashboardBoxKey>();

  for (const row of settings) {
    keepKeys.add(row.boxKey);
    const definition = getDashboardBoxDefinition(row.boxKey);
    if (!definition) {
      return { ok: false, error: `Unknown dashboard box “${row.boxKey}”.` };
    }

    if (
      settingsMatchSystemDefault({
        ...row,
        definition,
      })
    ) {
      toDeleteKeys.push(row.boxKey);
      continue;
    }

    const payload = {
      church_id: churchId,
      box_key: row.boxKey,
      is_visible: row.isVisible,
      display_order: row.displayOrder,
      background_color: row.backgroundColor,
      text_color: row.textColor,
      use_automatic_text_color: row.useAutomaticTextColor,
      updated_by: userId,
    };

    if (existingKeys.has(row.boxKey)) {
      toUpdate.push(payload);
    } else {
      toInsert.push({ ...payload, created_by: userId });
    }
  }

  if (toDeleteKeys.length > 0) {
    const { error: deleteError } = await supabase
      .from("dashboard_box_settings")
      .delete()
      .eq("church_id", churchId)
      .in("box_key", toDeleteKeys);
    if (deleteError) {
      return { ok: false, error: friendlyDashboardDbError(deleteError.message) };
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("dashboard_box_settings")
      .insert(toInsert);
    if (insertError) {
      return { ok: false, error: friendlyDashboardDbError(insertError.message) };
    }
  }

  for (const row of toUpdate) {
    const { error: updateError } = await supabase
      .from("dashboard_box_settings")
      .update({
        is_visible: row.is_visible,
        display_order: row.display_order,
        background_color: row.background_color,
        text_color: row.text_color,
        use_automatic_text_color: row.use_automatic_text_color,
        updated_by: row.updated_by,
      })
      .eq("church_id", churchId)
      .eq("box_key", row.box_key);
    if (updateError) {
      return { ok: false, error: friendlyDashboardDbError(updateError.message) };
    }
  }

  const leftover = [...existingKeys].filter(
    (key) => !keepKeys.has(key as DashboardBoxKey),
  );
  if (leftover.length > 0) {
    const { error } = await supabase
      .from("dashboard_box_settings")
      .delete()
      .eq("church_id", churchId)
      .in("box_key", leftover);
    if (error) {
      return { ok: false, error: friendlyDashboardDbError(error.message) };
    }
  }

  return { ok: true };
}

export async function resetChurchDashboardBoxSetting(params: {
  supabase: SupabaseClient;
  churchId: string;
  boxKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const churchId = assertDashboardChurchId(params.churchId);
  const { error } = await params.supabase
    .from("dashboard_box_settings")
    .delete()
    .eq("church_id", churchId)
    .eq("box_key", params.boxKey);

  if (error) {
    return { ok: false, error: friendlyDashboardDbError(error.message) };
  }
  return { ok: true };
}

export async function resetAllChurchDashboardBoxSettings(params: {
  supabase: SupabaseClient;
  churchId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const churchId = assertDashboardChurchId(params.churchId);
  const { error } = await params.supabase
    .from("dashboard_box_settings")
    .delete()
    .eq("church_id", churchId);

  if (error) {
    return { ok: false, error: friendlyDashboardDbError(error.message) };
  }
  return { ok: true };
}

/**
 * Delete override rows whose box_key is no longer in the app registry.
 * Safe no-op when none exist. Scoped strictly to churchId.
 */
export async function purgeObsoleteChurchDashboardBoxSettings(params: {
  supabase: SupabaseClient;
  churchId: string;
}): Promise<
  | { ok: true; purgedKeys: string[] }
  | { ok: false; error: string }
> {
  const churchId = assertDashboardChurchId(params.churchId);
  const { data, error } = await params.supabase
    .from("dashboard_box_settings")
    .select("box_key")
    .eq("church_id", churchId);

  if (error) {
    return { ok: false, error: friendlyDashboardDbError(error.message) };
  }

  const obsolete = collectObsoleteDashboardBoxKeys(
    ((data ?? []) as Array<{ box_key: string }>).map((row) => row.box_key),
  );

  if (obsolete.length === 0) {
    return { ok: true, purgedKeys: [] };
  }

  const { error: deleteError } = await params.supabase
    .from("dashboard_box_settings")
    .delete()
    .eq("church_id", churchId)
    .in("box_key", obsolete);

  if (deleteError) {
    return { ok: false, error: friendlyDashboardDbError(deleteError.message) };
  }

  return { ok: true, purgedKeys: obsolete };
}

export function friendlyDashboardDbError(message: string): string {
  if (/dashboard_box_settings|does not exist|schema cache/i.test(message)) {
    return "Dashboard customization is not configured yet. Run supabase/migrations/040_dashboard_box_settings.sql.";
  }
  if (/row-level security|permission denied|rls/i.test(message)) {
    return "You do not have permission to change dashboard settings for this church.";
  }
  if (/box_key|check constraint/i.test(message)) {
    return "One or more dashboard box keys are invalid.";
  }
  if (/background_color|text_color|check constraint/i.test(message)) {
    return "Colors must be stored as #RRGGBB.";
  }
  if (/foreign key|church_id/i.test(message)) {
    return "Unable to save dashboard settings for this church.";
  }
  return "Unable to update dashboard settings. Please try again.";
}

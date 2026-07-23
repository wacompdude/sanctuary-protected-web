import { createClient } from "@/lib/supabase/server";
import { isDashboardBoxKey } from "@/lib/dashboard/dashboard-box-registry";
import { normalizeHexColor } from "@/lib/dashboard/colors";
import type {
  DashboardBoxKey,
  DashboardBoxSettingRow,
} from "@/lib/dashboard/types";

function isMissingTable(message: string): boolean {
  return /dashboard_box_settings|does not exist|schema cache|Could not find the table/i.test(
    message,
  );
}

function mapRow(row: Record<string, unknown>): DashboardBoxSettingRow | null {
  const boxKey = String(row.box_key ?? "");
  if (!isDashboardBoxKey(boxKey)) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[dashboard-box-settings] Ignoring obsolete box_key “${boxKey}”`,
      );
    }
    return null;
  }

  const background =
    normalizeHexColor(String(row.background_color ?? "")) ?? "#E5E7EB";
  const text = normalizeHexColor(String(row.text_color ?? "")) ?? "#111827";

  return {
    id: String(row.id),
    church_id: String(row.church_id),
    box_key: boxKey,
    is_visible: Boolean(row.is_visible),
    display_order: Number(row.display_order) || 0,
    background_color: background,
    text_color: text,
    use_automatic_text_color: Boolean(row.use_automatic_text_color),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function areDashboardBoxSettingsAvailable(): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_box_settings")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  if (isMissingTable(error.message)) return false;
  return false;
}

export async function listChurchDashboardBoxSettings(
  churchId: string,
): Promise<DashboardBoxSettingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dashboard_box_settings")
    .select(
      "id, church_id, box_key, is_visible, display_order, background_color, text_color, use_automatic_text_color, created_by, updated_by, created_at, updated_at",
    )
    .eq("church_id", churchId);

  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(
      /does not exist|schema cache/i.test(error.message)
        ? "Dashboard customization is not configured yet. Run supabase/migrations/040_dashboard_box_settings.sql."
        : "Unable to load dashboard box settings.",
    );
  }

  return ((data ?? []) as Record<string, unknown>[])
    .map(mapRow)
    .filter((row): row is DashboardBoxSettingRow => Boolean(row));
}

export async function getChurchDashboardBoxSetting(
  churchId: string,
  boxKey: DashboardBoxKey,
): Promise<DashboardBoxSettingRow | null> {
  const rows = await listChurchDashboardBoxSettings(churchId);
  return rows.find((row) => row.box_key === boxKey) ?? null;
}

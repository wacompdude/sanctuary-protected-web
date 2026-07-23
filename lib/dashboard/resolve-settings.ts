import {
  listDashboardBoxDefinitions,
  getDashboardBoxDefinition,
} from "@/lib/dashboard/dashboard-box-registry";
import {
  deriveDashboardBoxPalette,
  normalizeHexColor,
  resolveDashboardTextColor,
} from "@/lib/dashboard/colors";
import { listChurchDashboardBoxSettings } from "@/lib/dashboard/queries";
import { canViewDashboardScheduleManagerBoxes } from "@/lib/dashboard/permissions";
import type {
  DashboardBoxKey,
  DashboardBoxSettingRow,
  ResolveDashboardBoxSettingsInput,
  ResolvedDashboardBoxSetting,
} from "@/lib/dashboard/types";

function mergeBox(
  key: DashboardBoxKey,
  override: DashboardBoxSettingRow | undefined,
): ResolvedDashboardBoxSetting | null {
  const definition = getDashboardBoxDefinition(key);
  if (!definition) return null;

  const backgroundColor =
    normalizeHexColor(override?.background_color ?? "") ??
    definition.defaultBackgroundColor;
  const useAutomaticTextColor =
    override?.use_automatic_text_color ?? true;
  const textResolution = resolveDashboardTextColor({
    backgroundColor,
    textColor:
      override?.text_color ?? definition.defaultTextColor,
    useAutomaticTextColor,
  });

  const isVisible = override?.is_visible ?? definition.defaultVisible;
  const displayOrder = override?.display_order ?? definition.defaultOrder;
  const isCustomized = Boolean(override);

  return {
    key: definition.key,
    title: definition.title,
    description: definition.description,
    category: definition.category,
    route: definition.route,
    supportsCampusFilter: definition.supportsCampusFilter,
    requiresScheduleManager: definition.requiresScheduleManager,
    isPlaceholder: definition.isPlaceholder,
    isVisible,
    displayOrder,
    backgroundColor,
    textColor: textResolution.textColor,
    useAutomaticTextColor,
    isCustomized,
    contrastRatio: textResolution.contrastRatio,
    contrastAcceptable: textResolution.contrastAcceptable,
    palette: deriveDashboardBoxPalette(
      backgroundColor,
      textResolution.textColor,
    ),
  };
}

/**
 * Merge system registry defaults with church overrides.
 * Filters by role/schedule permission. Sorts by display order.
 */
export async function resolveDashboardBoxSettings(
  input: ResolveDashboardBoxSettingsInput,
): Promise<ResolvedDashboardBoxSetting[]> {
  const overrides = await listChurchDashboardBoxSettings(input.churchId);
  const overrideByKey = new Map(
    overrides.map((row) => [row.box_key, row] as const),
  );

  const canSeeManagerBoxes =
    input.canManageSchedule ??
    canViewDashboardScheduleManagerBoxes(input.userRole);

  const resolved: ResolvedDashboardBoxSetting[] = [];

  for (const definition of listDashboardBoxDefinitions()) {
    if (definition.requiresScheduleManager && !canSeeManagerBoxes) {
      continue;
    }
    const merged = mergeBox(definition.key, overrideByKey.get(definition.key));
    if (!merged) continue;
    if (!input.includeHidden && !merged.isVisible) continue;
    resolved.push(merged);
  }

  return resolved.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.key.localeCompare(b.key);
  });
}

/**
 * Settings editor list: every registry box the user may configure,
 * including hidden ones, merged with overrides.
 */
export async function resolveDashboardBoxSettingsForEditor(
  churchId: string,
  userRole: ResolveDashboardBoxSettingsInput["userRole"],
): Promise<ResolvedDashboardBoxSetting[]> {
  return resolveDashboardBoxSettings({
    churchId,
    userRole,
    canManageSchedule: true,
    includeHidden: true,
  });
}

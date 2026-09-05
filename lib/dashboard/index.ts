export type {
  DashboardBoxKey,
  DashboardBoxCategory,
  DashboardBoxDefinition,
  DashboardBoxSettingRow,
  DashboardBoxPalette,
  ResolvedDashboardBoxSetting,
  DashboardBoxSettingInput,
  ResolveDashboardBoxSettingsInput,
  DashboardDisplaySettings,
} from "@/lib/dashboard/types";
export {
  DASHBOARD_BOX_KEYS,
  DEFAULT_DASHBOARD_DISPLAY_SETTINGS,
} from "@/lib/dashboard/types";
export {
  DASHBOARD_BOX_REGISTRY,
  isDashboardBoxKey,
  getDashboardBoxDefinition,
  listDashboardBoxDefinitions,
} from "@/lib/dashboard/dashboard-box-registry";
export {
  DASHBOARD_COLOR_PRESETS,
  DASHBOARD_TEXT_DARK,
  DASHBOARD_TEXT_LIGHT,
  isHexColor,
  normalizeHexColor,
  getRelativeLuminance,
  getContrastRatio,
  isContrastAcceptable,
  getAccessibleTextColor,
  mixHexColor,
  deriveDashboardBoxPalette,
  resolveDashboardTextColor,
} from "@/lib/dashboard/colors";
export {
  isDashboardBoxZeroCount,
  deriveZeroCountDashboardBoxPalette,
  getDashboardBoxDisplayPalette,
} from "@/lib/dashboard/presentation";
export {
  normalizeDashboardItemCount,
  sortDashboardBoxes,
} from "@/lib/dashboard/sort";
export type { DashboardSortableBox } from "@/lib/dashboard/sort";
export {
  canViewDashboardCustomization,
  canManageDashboardCustomization,
  canViewDashboardScheduleManagerBoxes,
  assertCanManageDashboardCustomization,
} from "@/lib/dashboard/permissions";
export {
  parseDashboardBoxKey,
  parseHexColorField,
  validateDashboardSettingsUpdate,
  normalizeDashboardDisplayOrder,
  settingsMatchSystemDefault,
} from "@/lib/dashboard/validation";
export {
  areDashboardBoxSettingsAvailable,
  listChurchDashboardBoxSettings,
  getChurchDashboardBoxSetting,
  getChurchDashboardDisplaySettings,
} from "@/lib/dashboard/queries";
export {
  resolveDashboardBoxSettings,
  resolveDashboardBoxSettingsForEditor,
} from "@/lib/dashboard/resolve-settings";
export {
  getDashboardBoxValue,
  dashboardBoxNeedsIncidents,
  dashboardBoxNeedsSafetyConcerns,
  dashboardBoxNeedsEvents,
  dashboardBoxNeedsCertifications,
  dashboardBoxNeedsSchedule,
} from "@/lib/dashboard/box-values";
export type { DashboardBoxValue, DashboardBoxDataContext } from "@/lib/dashboard/box-values";
export {
  replaceChurchDashboardBoxSettings,
  resetChurchDashboardBoxSetting,
  resetAllChurchDashboardBoxSettings,
  resetChurchDashboardDisplaySettings,
  upsertChurchDashboardDisplaySettings,
  purgeObsoleteChurchDashboardBoxSettings,
  friendlyDashboardDbError,
} from "@/lib/dashboard/mutations";
export {
  assertDashboardOrganizationId,
  rejectBrowserSubmittedOrganizationId,
  collectObsoleteDashboardBoxKeys,
  countCustomizedDashboardSettings,
  sanitizeDashboardActionError,
} from "@/lib/dashboard/security";

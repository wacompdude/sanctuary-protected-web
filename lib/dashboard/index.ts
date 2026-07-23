export type {
  DashboardBoxKey,
  DashboardBoxCategory,
  DashboardBoxDefinition,
  DashboardBoxSettingRow,
  DashboardBoxPalette,
  ResolvedDashboardBoxSetting,
  DashboardBoxSettingInput,
  ResolveDashboardBoxSettingsInput,
} from "@/lib/dashboard/types";
export { DASHBOARD_BOX_KEYS } from "@/lib/dashboard/types";
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
  deriveDashboardBoxPalette,
  resolveDashboardTextColor,
} from "@/lib/dashboard/colors";
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
} from "@/lib/dashboard/queries";
export {
  resolveDashboardBoxSettings,
  resolveDashboardBoxSettingsForEditor,
} from "@/lib/dashboard/resolve-settings";
export {
  getDashboardBoxValue,
  dashboardBoxNeedsIncidents,
  dashboardBoxNeedsEvents,
  dashboardBoxNeedsCertifications,
  dashboardBoxNeedsSchedule,
} from "@/lib/dashboard/box-values";
export type { DashboardBoxValue, DashboardBoxDataContext } from "@/lib/dashboard/box-values";
export {
  replaceChurchDashboardBoxSettings,
  resetChurchDashboardBoxSetting,
  resetAllChurchDashboardBoxSettings,
  purgeObsoleteChurchDashboardBoxSettings,
  friendlyDashboardDbError,
} from "@/lib/dashboard/mutations";
export {
  assertDashboardChurchId,
  rejectBrowserSubmittedChurchId,
  collectObsoleteDashboardBoxKeys,
  countCustomizedDashboardSettings,
  sanitizeDashboardActionError,
} from "@/lib/dashboard/security";

import type { MembershipRole } from "@/lib/church/types";

export const DASHBOARD_BOX_KEYS = [
  "active_incidents",
  "unacknowledged_events",
  "camera_events",
  "security_alarm_events",
  "certifications_expiring",
  "certifications_expired",
  "upcoming_events",
  "todays_shifts",
  "unfilled_shifts",
  "pending_responses",
  "unavailable_today",
  "upcoming_training",
] as const;

export type DashboardBoxKey = (typeof DASHBOARD_BOX_KEYS)[number];

export type DashboardBoxCategory =
  | "operations"
  | "integrations"
  | "compliance"
  | "schedule";

export type DashboardBoxDefinition = {
  key: DashboardBoxKey;
  title: string;
  description: string;
  defaultVisible: boolean;
  defaultOrder: number;
  defaultBackgroundColor: string;
  defaultTextColor: string;
  category: DashboardBoxCategory;
  route: string;
  supportsCampusFilter: boolean;
  /** When true, only users who can manage schedule see this box. */
  requiresScheduleManager: boolean;
  isPlaceholder: boolean;
};

export type DashboardBoxSettingRow = {
  id: string;
  church_id: string;
  box_key: DashboardBoxKey;
  is_visible: boolean;
  display_order: number;
  background_color: string;
  text_color: string;
  use_automatic_text_color: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardBoxPalette = {
  backgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  linkColor: string;
};

export type ResolvedDashboardBoxSetting = {
  key: DashboardBoxKey;
  title: string;
  description: string;
  category: DashboardBoxCategory;
  route: string;
  supportsCampusFilter: boolean;
  requiresScheduleManager: boolean;
  isPlaceholder: boolean;
  isVisible: boolean;
  displayOrder: number;
  backgroundColor: string;
  textColor: string;
  useAutomaticTextColor: boolean;
  isCustomized: boolean;
  contrastRatio: number;
  contrastAcceptable: boolean;
  palette: DashboardBoxPalette;
};

export type DashboardBoxSettingInput = {
  boxKey: DashboardBoxKey;
  isVisible: boolean;
  displayOrder: number;
  backgroundColor: string;
  textColor: string;
  useAutomaticTextColor: boolean;
};

export type ResolveDashboardBoxSettingsInput = {
  churchId: string;
  userRole: MembershipRole;
  /** When false, schedule manager-only boxes are omitted. */
  canManageSchedule?: boolean;
  /** Include hidden boxes (settings UI). Default false. */
  includeHidden?: boolean;
};

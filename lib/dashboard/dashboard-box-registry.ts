import type {
  DashboardBoxDefinition,
  DashboardBoxKey,
} from "@/lib/dashboard/types";
import { DASHBOARD_BOX_KEYS } from "@/lib/dashboard/types";
import { getAccessibleTextColor } from "@/lib/dashboard/colors";

/**
 * Authoritative system defaults for dashboard summary boxes.
 * Keep box_key allowlist in sync with migration 040_dashboard_box_settings.sql.
 */
export const DASHBOARD_BOX_REGISTRY: readonly DashboardBoxDefinition[] = [
  {
    key: "active_incidents",
    title: "Active Incidents",
    description: "Open or investigating incidents",
    defaultVisible: true,
    defaultOrder: 10,
    defaultBackgroundColor: "#FCA5A5",
    defaultTextColor: "#111827",
    category: "operations",
    route: "/incidents",
    supportsCampusFilter: true,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
  {
    key: "unacknowledged_events",
    title: "Unacknowledged Events",
    description: "Device alerts needing review",
    defaultVisible: true,
    defaultOrder: 20,
    defaultBackgroundColor: "#FDBA74",
    defaultTextColor: "#111827",
    category: "operations",
    route: "/events",
    supportsCampusFilter: true,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
  {
    key: "camera_events",
    title: "Camera Events",
    description: "Placeholder — camera feed alerts coming soon",
    defaultVisible: true,
    defaultOrder: 30,
    defaultBackgroundColor: "#C0C0C0",
    defaultTextColor: "#111827",
    category: "integrations",
    route: "/cameras",
    supportsCampusFilter: false,
    requiresScheduleManager: false,
    isPlaceholder: true,
  },
  {
    key: "security_alarm_events",
    title: "Security Alarm Events",
    description: "Placeholder — alarm monitoring coming soon",
    defaultVisible: true,
    defaultOrder: 40,
    defaultBackgroundColor: "#FF1A1A",
    defaultTextColor: "#FFFFFF",
    category: "integrations",
    route: "/sensors",
    supportsCampusFilter: false,
    requiresScheduleManager: false,
    isPlaceholder: true,
  },
  {
    key: "certifications_expiring",
    title: "Expiring Certifications",
    description: "Expiring within 60 days (church-wide)",
    defaultVisible: true,
    defaultOrder: 50,
    defaultBackgroundColor: "#93C5FD",
    defaultTextColor: "#111827",
    category: "compliance",
    route: "/certifications",
    supportsCampusFilter: false,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
  {
    key: "certifications_expired",
    title: "Expired Certifications",
    description: "Need renewal (church-wide)",
    defaultVisible: true,
    defaultOrder: 60,
    defaultBackgroundColor: "#FDE047",
    defaultTextColor: "#111827",
    category: "compliance",
    route: "/certifications",
    supportsCampusFilter: false,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
  {
    key: "upcoming_events",
    title: "Upcoming Events",
    description: "Next 7 days",
    defaultVisible: true,
    defaultOrder: 70,
    defaultBackgroundColor: "#93C5FD",
    defaultTextColor: "#111827",
    category: "schedule",
    route: "/schedule/events",
    supportsCampusFilter: true,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
  {
    key: "todays_shifts",
    title: "Today's Shifts",
    description: "Coverage windows today",
    defaultVisible: true,
    defaultOrder: 80,
    defaultBackgroundColor: "#FDBA74",
    defaultTextColor: "#111827",
    category: "schedule",
    route: "/schedule/shifts",
    supportsCampusFilter: true,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
  {
    key: "unfilled_shifts",
    title: "Unfilled Shifts",
    description: "Next 7 days needing staff",
    defaultVisible: true,
    defaultOrder: 90,
    defaultBackgroundColor: "#FCA5A5",
    defaultTextColor: "#111827",
    category: "schedule",
    route: "/schedule/shifts?unfilled=1",
    supportsCampusFilter: true,
    requiresScheduleManager: true,
    isPlaceholder: false,
  },
  {
    key: "pending_responses",
    title: "Pending Responses",
    description: "Invites awaiting accept/decline",
    defaultVisible: true,
    defaultOrder: 100,
    defaultBackgroundColor: "#FDE047",
    defaultTextColor: "#111827",
    category: "schedule",
    route: "/schedule/shifts",
    supportsCampusFilter: true,
    requiresScheduleManager: true,
    isPlaceholder: false,
  },
  {
    key: "unavailable_today",
    title: "Unavailable Today",
    description: "Active unavailability blocks",
    defaultVisible: true,
    defaultOrder: 110,
    defaultBackgroundColor: "#C0C0C0",
    defaultTextColor: "#111827",
    category: "schedule",
    route: "/schedule/availability?view=team",
    supportsCampusFilter: true,
    requiresScheduleManager: true,
    isPlaceholder: false,
  },
  {
    key: "upcoming_training",
    title: "Upcoming Training",
    description: "Training events in 7 days",
    defaultVisible: true,
    defaultOrder: 120,
    defaultBackgroundColor: "#93C5FD",
    defaultTextColor: "#111827",
    category: "schedule",
    route: "/schedule/events?eventType=training",
    supportsCampusFilter: true,
    requiresScheduleManager: false,
    isPlaceholder: false,
  },
] as const;

const registryByKey = new Map(
  DASHBOARD_BOX_REGISTRY.map((definition) => [definition.key, definition]),
);

export function isDashboardBoxKey(value: string): value is DashboardBoxKey {
  return (DASHBOARD_BOX_KEYS as readonly string[]).includes(value);
}

export function getDashboardBoxDefinition(
  key: DashboardBoxKey,
): DashboardBoxDefinition | null {
  return registryByKey.get(key) ?? null;
}

export function listDashboardBoxDefinitions(): DashboardBoxDefinition[] {
  return [...DASHBOARD_BOX_REGISTRY].sort(
    (a, b) => a.defaultOrder - b.defaultOrder,
  );
}

/** Ensure registry default text colors stay accessible against default backgrounds. */
export function assertRegistryContrastDefaults(): void {
  for (const definition of DASHBOARD_BOX_REGISTRY) {
    const auto = getAccessibleTextColor(definition.defaultBackgroundColor);
    if (
      definition.defaultTextColor.toUpperCase() !== auto.toUpperCase() &&
      process.env.NODE_ENV === "development"
    ) {
      console.warn(
        `[dashboard-registry] ${definition.key} defaultTextColor ${definition.defaultTextColor} differs from auto ${auto}`,
      );
    }
  }
}

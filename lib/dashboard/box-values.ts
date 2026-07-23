import type { DashboardBoxKey } from "@/lib/dashboard/types";
import type { ScheduleDashboardSummary } from "@/lib/schedule/types";

export type DashboardBoxValue = {
  value: string;
  description: string;
};

export type DashboardBoxDataContext = {
  openIncidents: number;
  totalIncidents: number;
  unacknowledgedEvents: number;
  certificationsExpiring: number;
  certificationsExpired: number;
  schedule: ScheduleDashboardSummary | null;
};

/** Build display value + description for a visible dashboard box. */
export function getDashboardBoxValue(
  key: DashboardBoxKey,
  data: DashboardBoxDataContext,
): DashboardBoxValue {
  switch (key) {
    case "active_incidents":
      return {
        value: String(data.openIncidents),
        description:
          data.totalIncidents > 0
            ? `${data.totalIncidents} total on record`
            : "Open or investigating incidents",
      };
    case "unacknowledged_events":
      return {
        value: String(data.unacknowledgedEvents),
        description: "Device alerts needing review",
      };
    case "camera_events":
      return {
        value: "—",
        description: "Placeholder — camera feed alerts coming soon",
      };
    case "security_alarm_events":
      return {
        value: "—",
        description: "Placeholder — alarm monitoring coming soon",
      };
    case "certifications_expiring":
      return {
        value: String(data.certificationsExpiring),
        description: "Expiring within 60 days (church-wide)",
      };
    case "certifications_expired":
      return {
        value: String(data.certificationsExpired),
        description: "Need renewal (church-wide)",
      };
    case "upcoming_events":
      return {
        value: String(data.schedule?.upcomingEvents ?? 0),
        description: "Next 7 days",
      };
    case "todays_shifts":
      return {
        value: String(data.schedule?.todaysShifts ?? 0),
        description: "Coverage windows today",
      };
    case "unfilled_shifts":
      return {
        value: String(data.schedule?.unfilledShifts ?? 0),
        description: "Next 7 days needing staff",
      };
    case "pending_responses":
      return {
        value: String(data.schedule?.pendingResponses ?? 0),
        description: "Invites awaiting accept/decline",
      };
    case "unavailable_today":
      return {
        value: String(data.schedule?.unavailableToday ?? 0),
        description: "Active unavailability blocks",
      };
    case "upcoming_training":
      return {
        value: String(data.schedule?.upcomingTraining ?? 0),
        description: "Training events in 7 days",
      };
    default: {
      const _exhaustive: never = key;
      return { value: "—", description: String(_exhaustive) };
    }
  }
}

export function dashboardBoxNeedsIncidents(keys: Iterable<DashboardBoxKey>): boolean {
  return [...keys].includes("active_incidents");
}

export function dashboardBoxNeedsEvents(keys: Iterable<DashboardBoxKey>): boolean {
  return [...keys].includes("unacknowledged_events");
}

export function dashboardBoxNeedsCertifications(
  keys: Iterable<DashboardBoxKey>,
): boolean {
  const set = new Set(keys);
  return (
    set.has("certifications_expiring") || set.has("certifications_expired")
  );
}

export function dashboardBoxNeedsSchedule(
  keys: Iterable<DashboardBoxKey>,
): boolean {
  return [...keys].some((key) => {
    switch (key) {
      case "upcoming_events":
      case "todays_shifts":
      case "unfilled_shifts":
      case "pending_responses":
      case "unavailable_today":
      case "upcoming_training":
        return true;
      default:
        return false;
    }
  });
}

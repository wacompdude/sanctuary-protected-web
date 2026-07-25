import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "@/lib/incidents/constants";
import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from "@/lib/incidents/types";

export type IncidentAnalyticsBucket = {
  key: string;
  label: string;
  count: number;
  percent: number;
  color: string;
};

export type IncidentAnalyticsSummary = {
  total: number;
  openActive: number;
  byType: IncidentAnalyticsBucket[];
  bySeverity: IncidentAnalyticsBucket[];
  byStatus: IncidentAnalyticsBucket[];
};

const TYPE_COLORS: Record<IncidentType, string> = {
  security: "#2563EB",
  medical: "#DC2626",
  fire: "#EA580C",
  theft: "#7C3AED",
  vandalism: "#DB2777",
  disturbance: "#CA8A04",
  other: "#6B7280",
};

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  low: "#9CA3AF",
  medium: "#F59E0B",
  high: "#F97316",
  critical: "#DC2626",
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  open: "#DC2626",
  investigating: "#2563EB",
  resolved: "#16A34A",
  closed: "#6B7280",
};

const CLOSED_STATUSES = new Set<IncidentStatus>(["closed", "resolved"]);

function percentOf(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function countByKey<T extends string>(
  incidents: Incident[],
  getKey: (incident: Incident) => T,
  catalog: { value: T; label: string }[],
  colors: Record<T, string>,
): IncidentAnalyticsBucket[] {
  const counts = new Map<T, number>();
  for (const item of catalog) {
    counts.set(item.value, 0);
  }
  for (const incident of incidents) {
    const key = getKey(incident);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = incidents.length;
  return catalog.map((item) => {
    const count = counts.get(item.value) ?? 0;
    return {
      key: item.value,
      label: item.label,
      count,
      percent: percentOf(count, total),
      color: colors[item.value],
    };
  });
}

export function buildIncidentAnalytics(
  incidents: Incident[],
): IncidentAnalyticsSummary {
  return {
    total: incidents.length,
    openActive: incidents.filter(
      (incident) => !CLOSED_STATUSES.has(incident.status),
    ).length,
    byType: countByKey(
      incidents,
      (incident) => incident.type,
      INCIDENT_TYPES,
      TYPE_COLORS,
    ),
    bySeverity: countByKey(
      incidents,
      (incident) => incident.severity,
      INCIDENT_SEVERITIES,
      SEVERITY_COLORS,
    ),
    byStatus: countByKey(
      incidents,
      (incident) => incident.status,
      INCIDENT_STATUSES,
      STATUS_COLORS,
    ),
  };
}

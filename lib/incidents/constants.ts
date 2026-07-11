import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
} from "./types";

export const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: "security", label: "Security" },
  { value: "medical", label: "Medical" },
  { value: "fire", label: "Fire" },
  { value: "theft", label: "Theft" },
  { value: "vandalism", label: "Vandalism" },
  { value: "disturbance", label: "Disturbance" },
  { value: "other", label: "Other" },
];

export const INCIDENT_SEVERITIES: {
  value: IncidentSeverity;
  label: string;
}[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export const INCIDENT_STATUSES: { value: IncidentStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export const INCIDENT_TYPE_SET = new Set(
  INCIDENT_TYPES.map((item) => item.value),
);

export const INCIDENT_SEVERITY_SET = new Set(
  INCIDENT_SEVERITIES.map((item) => item.value),
);

export const INCIDENT_STATUS_SET = new Set(
  INCIDENT_STATUSES.map((item) => item.value),
);

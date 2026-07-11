export type EventType =
  | "motion"
  | "door"
  | "tamper"
  | "offline"
  | "alarm"
  | "other";

export type EventSeverity = "low" | "medium" | "high" | "critical";

export type AcknowledgmentStatus = "unacknowledged" | "acknowledged";

export interface SecurityEvent {
  id: string;
  church_id: string;
  device: string;
  event_type: EventType;
  severity: EventSeverity;
  event_timestamp: string;
  location: string;
  acknowledgment_status: AcknowledgmentStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "motion", label: "Motion" },
  { value: "door", label: "Door" },
  { value: "tamper", label: "Tamper" },
  { value: "offline", label: "Offline" },
  { value: "alarm", label: "Alarm" },
  { value: "other", label: "Other" },
];

export const EVENT_SEVERITIES: { value: EventSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export type IncidentType =
  | "security"
  | "medical"
  | "fire"
  | "theft"
  | "vandalism"
  | "disturbance"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus =
  | "open"
  | "investigating"
  | "resolved"
  | "closed";

export type IncidentUpdateType = "created" | "comment" | "status_change";

export type { ActionState, Church, Profile } from "@/lib/church/types";

export interface Incident {
  id: string;
  church_id: string;
  created_by: string;
  title: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  location: string;
  description: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  church_id: string;
  created_by: string;
  update_type: IncidentUpdateType;
  content: string;
  previous_status: IncidentStatus | null;
  new_status: IncidentStatus | null;
  created_at: string;
  author_email?: string | null;
}

export interface IncidentWithUpdates extends Incident {
  updates: IncidentUpdate[];
}

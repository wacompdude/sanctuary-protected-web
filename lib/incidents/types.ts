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

export interface IncidentAttachment {
  id: string;
  church_id: string;
  incident_id: string;
  uploaded_by: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  original_filename: string | null;
  created_at: string;
  /** Short-lived signed URL for private storage display. */
  signed_url?: string | null;
}

export interface IncidentInvolvedMember {
  id: string;
  incident_id: string;
  membership_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
}

export interface IncidentWithUpdates extends Incident {
  updates: IncidentUpdate[];
  attachments: IncidentAttachment[];
}

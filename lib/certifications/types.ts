export type CertificationComputedStatus =
  | "active"
  | "expiring_soon"
  | "expired";

export interface TeamMember {
  id: string;
  church_id: string;
  full_name: string;
  email: string | null;
  title: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Certification {
  id: string;
  church_id: string;
  team_member_id: string;
  certification_type: string;
  issuer: string;
  issue_date: string;
  expiration_date: string;
  certificate_number: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CertificationWithMember extends Certification {
  team_member: Pick<TeamMember, "id" | "full_name" | "title" | "email"> | null;
  status: CertificationComputedStatus;
}

export const EXPIRING_SOON_DAYS = 60;

export const CERTIFICATION_TYPE_OPTIONS = [
  "CPR & First Aid",
  "Security Guard License",
  "Fire Safety Training",
  "Defensive Driving",
  "Hazmat Awareness",
  "Emergency Response",
  "Other",
] as const;

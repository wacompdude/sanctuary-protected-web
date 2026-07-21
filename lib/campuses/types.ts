import type { ActionState } from "@/lib/church/types";

export type CampusType =
  | "main"
  | "satellite"
  | "administrative"
  | "school"
  | "event_center"
  | "office"
  | "other";

export type CampusStatus =
  | "planned"
  | "active"
  | "inactive"
  | "suspended"
  | "closed"
  | "archived";

export type Campus = {
  id: string;
  church_id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
  description: string | null;
  campus_type: CampusType;
  status: CampusStatus;
  is_primary: boolean;
  primary_email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  police_non_emergency_phone: string | null;
  fire_non_emergency_phone: string | null;
  nearest_hospital_name: string | null;
  nearest_hospital_phone: string | null;
  nearest_hospital_address: string | null;
  logo_path: string | null;
  primary_brand_color: string | null;
  secondary_brand_color: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  member_count?: number;
};

export type CampusListResult = {
  items: Campus[];
  tablesAvailable: boolean;
  extendedSchema: boolean;
  hint?: string;
};

export type CampusActionState = ActionState & {
  campusId?: string;
};

export type CampusFormInput = {
  name: string;
  short_name: string | null;
  slug: string | null;
  description: string | null;
  campus_type: CampusType;
  status: CampusStatus;
  is_primary: boolean;
  primary_email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  police_non_emergency_phone: string | null;
  fire_non_emergency_phone: string | null;
  nearest_hospital_name: string | null;
  nearest_hospital_phone: string | null;
  nearest_hospital_address: string | null;
};

export type CampusRole =
  | "campus_leader"
  | "campus_administrator"
  | "campus_security_leader"
  | "campus_security_member"
  | "campus_staff"
  | "campus_viewer";

export type CampusMembershipStatus = "active" | "inactive" | "removed";

export type CampusMembership = {
  id: string;
  church_id: string;
  campus_id: string;
  church_membership_id: string;
  user_id: string;
  campus_role: CampusRole;
  status: CampusMembershipStatus;
  is_primary_campus: boolean;
  assigned_by: string | null;
  assigned_at: string;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  display_name?: string;
  email?: string | null;
  church_role?: string | null;
  campus_name?: string | null;
  campus_short_name?: string | null;
};

export type OwnCampusMembership = {
  id: string;
  church_id: string;
  church_name: string;
  campus_id: string;
  campus_name: string;
  campus_role: CampusRole;
  is_primary_campus: boolean;
  status: CampusMembershipStatus;
  church_role: string;
  has_implicit_all_campus_access: boolean;
};

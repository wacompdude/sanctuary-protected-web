import type { MembershipRole } from "@/lib/church/types";
import { hasMinRole } from "@/lib/church/navigation";

export type EquipmentCategory =
  | "radio"
  | "camera"
  | "video_recorder"
  | "network_device"
  | "access_control"
  | "alarm_system"
  | "panic_button"
  | "sensor"
  | "power_backup"
  | "first_response"
  | "computer"
  | "mobile_device"
  | "other";

export type EquipmentStatus =
  | "planned"
  | "ordered"
  | "received"
  | "active"
  | "maintenance"
  | "out_of_service"
  | "retired"
  | "lost"
  | "stolen"
  | "disposed";

export type EquipmentCriticality = "low" | "medium" | "high" | "critical";

export type EquipmentActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export type CampusOption = {
  id: string;
  name: string;
  status: string;
};

export type SecurityEquipment = {
  id: string;
  church_id: string;
  campus_id: string | null;
  category: EquipmentCategory;
  subcategory: string | null;
  name: string;
  description: string | null;
  asset_tag: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  status: EquipmentStatus;
  criticality: EquipmentCriticality;
  location_name: string | null;
  building: string | null;
  floor: string | null;
  room: string | null;
  installation_area: string | null;
  assigned_user_id: string | null;
  assigned_team: string | null;
  responsible_user_id: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  vendor_name: string | null;
  vendor_contact: string | null;
  warranty_expiration: string | null;
  installed_date: string | null;
  last_inspected_at: string | null;
  next_inspection_at: string | null;
  last_maintenance_at: string | null;
  next_maintenance_at: string | null;
  expected_replacement_date: string | null;
  replacement_cost_estimate: number | null;
  notes: string | null;
  photo_path: string | null;
  manual_path: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  campus_name?: string | null;
};

export type SecurityEquipmentWithDetails = SecurityEquipment & {
  categoryDetails: {
    table: string;
    values: Record<string, string | number | boolean | null>;
  } | null;
};

export type EquipmentListFilters = {
  q?: string;
  category?: EquipmentCategory | "";
  status?: EquipmentStatus | "";
  campusId?: string;
  criticality?: EquipmentCriticality | "";
  includeArchived?: boolean;
  maintenanceDue?: boolean;
  warrantyExpiring?: boolean;
  replacementDue?: boolean;
  unassigned?: boolean;
  criticalOnly?: boolean;
};

export type EquipmentSummary = {
  total: number;
  active: number;
  outOfService: number;
  maintenanceDue: number;
  warrantyExpiring: number;
  replacementDue: number;
  critical: number;
  unassigned: number;
};

export function canManageSecurityEquipment(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

export function canOperateSecurityEquipment(role: MembershipRole): boolean {
  return hasMinRole(role, "security_member");
}

export function canViewSecurityEquipment(role: MembershipRole): boolean {
  return hasMinRole(role, "viewer");
}

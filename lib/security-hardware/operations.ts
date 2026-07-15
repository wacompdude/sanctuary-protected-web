import type { ActionState } from "@/lib/church/types";

export type EquipmentMaintenanceType =
  | "inspection"
  | "preventive_maintenance"
  | "repair"
  | "firmware_update"
  | "battery_replacement"
  | "calibration"
  | "cleaning"
  | "functional_test"
  | "configuration_backup"
  | "other";

export type EquipmentMaintenanceStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "deferred"
  | "cancelled"
  | "failed_inspection";

export type EquipmentAssignmentStatus =
  | "active"
  | "returned"
  | "lost"
  | "damaged"
  | "cancelled";

export type EquipmentMaintenanceRecord = {
  id: string;
  church_id: string;
  equipment_id: string;
  maintenance_type: EquipmentMaintenanceType;
  status: EquipmentMaintenanceStatus;
  description: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  completed_by: string | null;
  vendor: string | null;
  cost: number | null;
  work_order_number: string | null;
  findings: string | null;
  corrective_action: string | null;
  next_maintenance_date: string | null;
  attachment_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  equipment_name?: string | null;
  equipment_asset_tag?: string | null;
};

export type EquipmentAssignmentRecord = {
  id: string;
  church_id: string;
  equipment_id: string;
  assigned_user_id: string | null;
  assigned_team: string | null;
  assigned_by: string | null;
  assigned_at: string;
  expected_return_date: string | null;
  returned_at: string | null;
  return_condition: string | null;
  assignment_notes: string | null;
  status: EquipmentAssignmentStatus;
  created_at: string;
  updated_at: string;
  assigned_user_name?: string | null;
};

export type OpsActionState = ActionState;

export const MAINTENANCE_TYPES: {
  value: EquipmentMaintenanceType;
  label: string;
}[] = [
  { value: "inspection", label: "Inspection" },
  { value: "preventive_maintenance", label: "Preventive maintenance" },
  { value: "repair", label: "Repair" },
  { value: "firmware_update", label: "Firmware update" },
  { value: "battery_replacement", label: "Battery replacement" },
  { value: "calibration", label: "Calibration" },
  { value: "cleaning", label: "Cleaning" },
  { value: "functional_test", label: "Functional test" },
  { value: "configuration_backup", label: "Configuration backup" },
  { value: "other", label: "Other" },
];

export const MAINTENANCE_STATUSES: {
  value: EquipmentMaintenanceStatus;
  label: string;
}[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "deferred", label: "Deferred" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed_inspection", label: "Failed inspection" },
];

export const ASSIGNMENT_STATUSES: {
  value: EquipmentAssignmentStatus;
  label: string;
}[] = [
  { value: "active", label: "Active" },
  { value: "returned", label: "Returned" },
  { value: "lost", label: "Lost" },
  { value: "damaged", label: "Damaged" },
  { value: "cancelled", label: "Cancelled" },
];

export function labelForMaintenanceType(value: string): string {
  return MAINTENANCE_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function labelForMaintenanceStatus(value: string): string {
  return (
    MAINTENANCE_STATUSES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForAssignmentStatus(value: string): string {
  return (
    ASSIGNMENT_STATUSES.find((item) => item.value === value)?.label ?? value
  );
}

import type { MembershipRole } from "@/lib/church/types";

export type MedicalSupplyCategory =
  | "gloves"
  | "bandages"
  | "dressings"
  | "antiseptic"
  | "medications"
  | "respiratory"
  | "splints"
  | "bleeding_control"
  | "protective_equipment"
  | "other";

export type MedicalSupply = {
  id: string;
  church_id: string;
  name: string;
  category: MedicalSupplyCategory;
  unit: string;
  quantity_on_hand: number;
  minimum_quantity: number;
  location_name: string | null;
  sku: string | null;
  vendor_name: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type MedicalSupplyUsage = {
  id: string;
  church_id: string;
  incident_id: string;
  medical_supply_id: string;
  quantity_used: number;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  supply_name?: string;
  supply_unit?: string;
};

export type MedicalSupplyActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export type RestockReportRow = MedicalSupply & {
  reorder_gap: number;
  used_last_30d: number;
};

export const MEDICAL_SUPPLY_MANAGEMENT_ROLES: MembershipRole[] = [
  "owner",
  "administrator",
  "security_leader",
];

export const MEDICAL_SUPPLY_USAGE_ROLES: MembershipRole[] = [
  "owner",
  "administrator",
  "security_leader",
  "security_member",
];

export function canManageMedicalSupplies(role: MembershipRole): boolean {
  return MEDICAL_SUPPLY_MANAGEMENT_ROLES.includes(role);
}

export function canRecordMedicalSupplyUsage(role: MembershipRole): boolean {
  return MEDICAL_SUPPLY_USAGE_ROLES.includes(role);
}

export function isLowStock(supply: Pick<MedicalSupply, "quantity_on_hand" | "minimum_quantity">): boolean {
  return supply.quantity_on_hand <= supply.minimum_quantity;
}

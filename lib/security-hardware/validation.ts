import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CRITICALITIES,
  EQUIPMENT_STATUSES,
} from "@/lib/security-hardware/constants";
import type {
  EquipmentActionState,
  EquipmentCategory,
  EquipmentCriticality,
  EquipmentStatus,
} from "@/lib/security-hardware/types";

function text(formData: FormData, key: string, max = 200): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseDate(formData: FormData, key: string): string | null {
  const value = text(formData, key, 32);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "__invalid__";
  return value;
}

function parseMoney(formData: FormData, key: string): number | null {
  const value = text(formData, key, 32);
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return Number.NaN;
  return Math.round(num * 100) / 100;
}

export type EquipmentFormInput = {
  category: EquipmentCategory;
  subcategory: string | null;
  name: string;
  description: string | null;
  status: EquipmentStatus;
  criticality: EquipmentCriticality;
  campus_id: string | null;
  location_name: string | null;
  building: string | null;
  floor: string | null;
  room: string | null;
  installation_area: string | null;
  asset_tag: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  vendor_name: string | null;
  vendor_contact: string | null;
  warranty_expiration: string | null;
  installed_date: string | null;
  assigned_team: string | null;
  next_inspection_at: string | null;
  next_maintenance_at: string | null;
  expected_replacement_date: string | null;
  replacement_cost_estimate: number | null;
  notes: string | null;
};

export function validateEquipmentForm(
  formData: FormData,
): EquipmentActionState & { data?: EquipmentFormInput } {
  const fieldErrors: Record<string, string> = {};

  const categoryRaw = text(formData, "category", 40) ?? "";
  const statusRaw = text(formData, "status", 40) ?? "";
  const criticalityRaw = text(formData, "criticality", 40) ?? "medium";
  const name = text(formData, "name", 200);

  if (!EQUIPMENT_CATEGORIES.some((item) => item.value === categoryRaw)) {
    fieldErrors.category = "Select a valid equipment category.";
  }
  if (!EQUIPMENT_STATUSES.some((item) => item.value === statusRaw)) {
    fieldErrors.status = "Select a valid status.";
  }
  if (!EQUIPMENT_CRITICALITIES.some((item) => item.value === criticalityRaw)) {
    fieldErrors.criticality = "Select a valid criticality.";
  }
  if (!name) {
    fieldErrors.name = "Name is required.";
  }

  const campusRaw = text(formData, "campus_id", 64);
  let campus_id: string | null = null;
  if (campusRaw) {
    if (!isValidUuid(campusRaw)) {
      fieldErrors.campus_id = "Invalid campus selection.";
    } else {
      campus_id = campusRaw;
    }
  }

  const dateFields = [
    "purchase_date",
    "warranty_expiration",
    "installed_date",
    "expected_replacement_date",
  ] as const;
  const dates: Record<string, string | null> = {};
  for (const key of dateFields) {
    const parsed = parseDate(formData, key);
    if (parsed === "__invalid__") {
      fieldErrors[key] = "Enter a valid date.";
    } else {
      dates[key] = parsed;
    }
  }

  const nextInspection = parseDate(formData, "next_inspection_at");
  if (nextInspection === "__invalid__") {
    fieldErrors.next_inspection_at = "Enter a valid date.";
  }
  const nextMaintenance = parseDate(formData, "next_maintenance_at");
  if (nextMaintenance === "__invalid__") {
    fieldErrors.next_maintenance_at = "Enter a valid date.";
  }

  const purchase_price = parseMoney(formData, "purchase_price");
  if (Number.isNaN(purchase_price)) {
    fieldErrors.purchase_price = "Enter a valid amount.";
  }
  const replacement_cost_estimate = parseMoney(
    formData,
    "replacement_cost_estimate",
  );
  if (Number.isNaN(replacement_cost_estimate)) {
    fieldErrors.replacement_cost_estimate = "Enter a valid amount.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      category: categoryRaw as EquipmentCategory,
      subcategory: text(formData, "subcategory", 100),
      name: name!,
      description: text(formData, "description", 2000),
      status: statusRaw as EquipmentStatus,
      criticality: criticalityRaw as EquipmentCriticality,
      campus_id,
      location_name: text(formData, "location_name", 200),
      building: text(formData, "building", 100),
      floor: text(formData, "floor", 50),
      room: text(formData, "room", 100),
      installation_area: text(formData, "installation_area", 200),
      asset_tag: text(formData, "asset_tag", 80),
      manufacturer: text(formData, "manufacturer", 120),
      model: text(formData, "model", 120),
      serial_number: text(formData, "serial_number", 120),
      purchase_date: dates.purchase_date ?? null,
      purchase_price,
      vendor_name: text(formData, "vendor_name", 120),
      vendor_contact: text(formData, "vendor_contact", 200),
      warranty_expiration: dates.warranty_expiration ?? null,
      installed_date: dates.installed_date ?? null,
      assigned_team: text(formData, "assigned_team", 120),
      next_inspection_at: nextInspection === "__invalid__" ? null : nextInspection,
      next_maintenance_at:
        nextMaintenance === "__invalid__" ? null : nextMaintenance,
      expected_replacement_date: dates.expected_replacement_date ?? null,
      replacement_cost_estimate,
      notes: text(formData, "notes", 5000),
    },
  };
}

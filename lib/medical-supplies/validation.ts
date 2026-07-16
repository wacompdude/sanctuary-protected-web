import { MEDICAL_SUPPLY_CATEGORIES } from "@/lib/medical-supplies/constants";
import type {
  MedicalSupplyActionState,
  MedicalSupplyCategory,
} from "@/lib/medical-supplies/types";

function text(formData: FormData, key: string, max = 200): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

function intOrZero(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return 0;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

export type MedicalSupplyFormData = {
  name: string;
  category: MedicalSupplyCategory;
  unit: string;
  quantity_on_hand: number;
  minimum_quantity: number;
  location_name: string | null;
  sku: string | null;
  vendor_name: string | null;
  notes: string | null;
};

export function validateMedicalSupplyForm(
  formData: FormData,
): MedicalSupplyActionState & { data?: MedicalSupplyFormData } {
  const fieldErrors: Record<string, string> = {};

  const name = text(formData, "name", 200);
  if (!name) fieldErrors.name = "Name is required.";

  const categoryRaw = text(formData, "category", 40) ?? "other";
  if (!MEDICAL_SUPPLY_CATEGORIES.some((item) => item.value === categoryRaw)) {
    fieldErrors.category = "Select a valid category.";
  }

  const unit = text(formData, "unit", 40) ?? "each";
  const quantityOnHand = intOrZero(formData, "quantity_on_hand");
  const minimumQuantity = intOrZero(formData, "minimum_quantity");

  if (quantityOnHand < 0) {
    fieldErrors.quantity_on_hand = "Quantity on hand must be zero or greater.";
  }
  if (minimumQuantity < 0) {
    fieldErrors.minimum_quantity = "Minimum quantity must be zero or greater.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      name: name!,
      category: categoryRaw as MedicalSupplyCategory,
      unit,
      quantity_on_hand: quantityOnHand,
      minimum_quantity: minimumQuantity,
      location_name: text(formData, "location_name", 120),
      sku: text(formData, "sku", 80),
      vendor_name: text(formData, "vendor_name", 120),
      notes: text(formData, "notes", 2000),
    },
  };
}

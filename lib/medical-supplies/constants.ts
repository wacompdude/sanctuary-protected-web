import type { MedicalSupplyCategory } from "@/lib/medical-supplies/types";

export const MEDICAL_SUPPLY_CATEGORIES: {
  value: MedicalSupplyCategory;
  label: string;
}[] = [
  { value: "gloves", label: "Gloves" },
  { value: "bandages", label: "Bandages" },
  { value: "dressings", label: "Dressings" },
  { value: "antiseptic", label: "Antiseptic" },
  { value: "medications", label: "Medications" },
  { value: "respiratory", label: "Respiratory" },
  { value: "splints", label: "Splints" },
  { value: "bleeding_control", label: "Bleeding control" },
  { value: "protective_equipment", label: "Protective equipment" },
  { value: "other", label: "Other" },
];

export const MEDICAL_SUPPLY_UNITS = [
  "each",
  "pair",
  "box",
  "pack",
  "roll",
  "bottle",
  "kit",
] as const;

export function labelForMedicalSupplyCategory(value: string): string {
  return (
    MEDICAL_SUPPLY_CATEGORIES.find((item) => item.value === value)?.label ??
    value
  );
}

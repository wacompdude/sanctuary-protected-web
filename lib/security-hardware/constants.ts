import type {
  EquipmentCategory,
  EquipmentCriticality,
  EquipmentStatus,
} from "@/lib/security-hardware/types";

export const EQUIPMENT_CATEGORIES: {
  value: EquipmentCategory;
  label: string;
  short: string;
}[] = [
  { value: "radio", label: "Radio", short: "RAD" },
  { value: "camera", label: "Security Camera", short: "CAM" },
  { value: "video_recorder", label: "NVR or DVR", short: "NVR" },
  { value: "network_device", label: "Network Device", short: "NET" },
  { value: "access_control", label: "Access-Control Device", short: "ACS" },
  { value: "alarm_system", label: "Alarm System", short: "ALM" },
  { value: "panic_button", label: "Panic Button", short: "PNC" },
  { value: "sensor", label: "Environmental Sensor", short: "SNS" },
  { value: "power_backup", label: "Backup Power", short: "PWR" },
  { value: "first_response", label: "First-Response Equipment", short: "FRS" },
  { value: "computer", label: "Computer or Workstation", short: "CPU" },
  { value: "mobile_device", label: "Mobile Device", short: "MOB" },
  { value: "other", label: "Other Equipment", short: "OTH" },
];

export const EQUIPMENT_STATUSES: {
  value: EquipmentStatus;
  label: string;
}[] = [
  { value: "planned", label: "Planned" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of service" },
  { value: "retired", label: "Retired" },
  { value: "lost", label: "Lost" },
  { value: "stolen", label: "Stolen" },
  { value: "disposed", label: "Disposed" },
];

export const EQUIPMENT_CRITICALITIES: {
  value: EquipmentCriticality;
  label: string;
}[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function labelForEquipmentCategory(value: string): string {
  return EQUIPMENT_CATEGORIES.find((item) => item.value === value)?.label ?? value;
}

export function shortCodeForCategory(value: EquipmentCategory): string {
  return (
    EQUIPMENT_CATEGORIES.find((item) => item.value === value)?.short ?? "OTH"
  );
}

export function labelForEquipmentStatus(value: string): string {
  return EQUIPMENT_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function labelForEquipmentCriticality(value: string): string {
  return (
    EQUIPMENT_CRITICALITIES.find((item) => item.value === value)?.label ?? value
  );
}

export function formatEquipmentDate(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  try {
    const dateOnly = value.length <= 10;
    return new Date(dateOnly ? `${value}T12:00:00` : value).toLocaleDateString(
      undefined,
      { year: "numeric", month: "short", day: "numeric" },
    );
  } catch {
    return "—";
  }
}

export function daysFromNow(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date.length <= 10 ? `${date}T12:00:00` : date);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

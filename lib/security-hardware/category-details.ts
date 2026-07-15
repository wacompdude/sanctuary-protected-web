import { hasMinRole } from "@/lib/church/navigation";
import type { MembershipRole } from "@/lib/church/types";
import type { EquipmentCategory } from "@/lib/security-hardware/types";

/** Detail table names in Postgres. */
export type CategoryDetailTable =
  | "radio_details"
  | "camera_details"
  | "video_recorder_details"
  | "network_device_details"
  | "access_control_details"
  | "alarm_device_details"
  | "sensor_details"
  | "power_backup_details"
  | "first_response_details";

export type CategoryDetailRecord = Record<string, string | number | boolean | null>;

export function detailTableForCategory(
  category: EquipmentCategory,
): CategoryDetailTable | null {
  switch (category) {
    case "radio":
      return "radio_details";
    case "camera":
      return "camera_details";
    case "video_recorder":
      return "video_recorder_details";
    case "network_device":
      return "network_device_details";
    case "access_control":
      return "access_control_details";
    case "alarm_system":
    case "panic_button":
      return "alarm_device_details";
    case "sensor":
      return "sensor_details";
    case "power_backup":
      return "power_backup_details";
    case "first_response":
      return "first_response_details";
    default:
      return null;
  }
}

export const ALL_DETAIL_TABLES: CategoryDetailTable[] = [
  "radio_details",
  "camera_details",
  "video_recorder_details",
  "network_device_details",
  "access_control_details",
  "alarm_device_details",
  "sensor_details",
  "power_backup_details",
  "first_response_details",
];

export const SENSITIVE_NETWORK_FIELDS = new Set([
  "ip_address",
  "mac_address",
  "management_ip",
  "vlan",
  "subnet",
]);

export function canViewSensitiveNetworkFields(role: MembershipRole): boolean {
  return hasMinRole(role, "security_leader");
}

export type DetailFieldDef = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "date" | "boolean" | "select";
  options?: { value: string; label: string }[];
  sensitive?: boolean;
  hint?: string;
};

export const RADIO_TYPES = [
  { value: "handheld", label: "Handheld" },
  { value: "mobile", label: "Mobile" },
  { value: "base_station", label: "Base station" },
  { value: "repeater", label: "Repeater" },
  { value: "other", label: "Other" },
];

export const RADIO_BANDS = [
  { value: "vhf", label: "VHF" },
  { value: "uhf", label: "UHF" },
  { value: "700_mhz", label: "700 MHz" },
  { value: "800_mhz", label: "800 MHz" },
  { value: "900_mhz", label: "900 MHz" },
  { value: "frs", label: "FRS" },
  { value: "gmrs", label: "GMRS" },
  { value: "other", label: "Other" },
];

export const CAMERA_TYPES = [
  { value: "fixed_dome", label: "Fixed dome" },
  { value: "turret", label: "Turret" },
  { value: "bullet", label: "Bullet" },
  { value: "ptz", label: "PTZ" },
  { value: "fisheye", label: "Fisheye" },
  { value: "doorbell", label: "Doorbell" },
  { value: "thermal", label: "Thermal" },
  { value: "license_plate", label: "License plate" },
  { value: "other", label: "Other" },
];

export const NETWORK_DEVICE_TYPES = [
  { value: "firewall", label: "Firewall" },
  { value: "router", label: "Router" },
  { value: "switch", label: "Switch" },
  { value: "wireless_access_point", label: "Wireless access point" },
  { value: "cellular_gateway", label: "Cellular gateway" },
  { value: "modem", label: "Modem" },
  { value: "server", label: "Server" },
  { value: "controller", label: "Controller" },
  { value: "network_bridge", label: "Network bridge" },
  { value: "other", label: "Other" },
];

export const ACCESS_CONTROL_TYPES = [
  { value: "card_reader", label: "Card reader" },
  { value: "keypad", label: "Keypad" },
  { value: "biometric_reader", label: "Biometric reader" },
  { value: "door_controller", label: "Door controller" },
  { value: "electric_strike", label: "Electric strike" },
  { value: "magnetic_lock", label: "Magnetic lock" },
  { value: "gate_controller", label: "Gate controller" },
  { value: "intercom", label: "Intercom" },
  { value: "other", label: "Other" },
];

export const ALARM_DEVICE_TYPES = [
  { value: "panic_button", label: "Panic button" },
  { value: "duress_button", label: "Duress button" },
  { value: "intrusion_panel", label: "Intrusion panel" },
  { value: "keypad", label: "Keypad" },
  { value: "siren", label: "Siren" },
  { value: "strobe", label: "Strobe" },
  { value: "glass_break_detector", label: "Glass-break detector" },
  { value: "motion_detector", label: "Motion detector" },
  { value: "other", label: "Other" },
];

export const SENSOR_TYPES = [
  { value: "water_leak", label: "Water leak" },
  { value: "smoke", label: "Smoke" },
  { value: "heat", label: "Heat" },
  { value: "temperature", label: "Temperature" },
  { value: "humidity", label: "Humidity" },
  { value: "carbon_monoxide", label: "Carbon monoxide" },
  { value: "door_contact", label: "Door contact" },
  { value: "window_contact", label: "Window contact" },
  { value: "motion", label: "Motion" },
  { value: "glass_break", label: "Glass break" },
  { value: "air_quality", label: "Air quality" },
  { value: "power_loss", label: "Power loss" },
  { value: "freezer", label: "Freezer or refrigerator" },
  { value: "other", label: "Other" },
];

export const POWER_TYPES = [
  { value: "ups", label: "UPS" },
  { value: "generator", label: "Generator" },
  { value: "portable_battery", label: "Portable battery" },
  { value: "surge_protector", label: "Surge protector" },
  { value: "pdu", label: "Power distribution unit" },
  { value: "other", label: "Other" },
];

export const FIRST_RESPONSE_TYPES = [
  { value: "aed", label: "AED" },
  { value: "first_aid_kit", label: "First aid kit" },
  { value: "trauma_kit", label: "Trauma kit" },
  { value: "stop_the_bleed", label: "Stop the Bleed kit" },
  { value: "fire_extinguisher", label: "Fire extinguisher" },
  { value: "emergency_oxygen", label: "Emergency oxygen" },
  { value: "evacuation_chair", label: "Evacuation chair" },
  { value: "flashlight", label: "Flashlight" },
  { value: "reflective_vest", label: "Reflective vest" },
  { value: "other", label: "Other" },
];

const RADIO_FIELDS: DetailFieldDef[] = [
  { key: "radio_type", label: "Radio type", kind: "select", options: RADIO_TYPES },
  { key: "frequency_band", label: "Frequency band", kind: "select", options: RADIO_BANDS },
  { key: "channel_plan_name", label: "Channel plan", kind: "text" },
  { key: "number_of_channels", label: "Number of channels", kind: "number" },
  {
    key: "digital_or_analog",
    label: "Digital or analog",
    kind: "select",
    options: [
      { value: "digital", label: "Digital" },
      { value: "analog", label: "Analog" },
      { value: "both", label: "Both" },
    ],
  },
  { key: "encryption_capable", label: "Encryption capable", kind: "boolean" },
  {
    key: "encryption_enabled",
    label: "Encryption enabled",
    kind: "boolean",
    hint: "Do not store encryption keys here.",
  },
  { key: "fcc_license_reference", label: "FCC license reference", kind: "text" },
  { key: "call_sign", label: "Call sign", kind: "text" },
  { key: "programming_profile", label: "Programming profile", kind: "text" },
  { key: "battery_type", label: "Battery type", kind: "text" },
  { key: "spare_battery_count", label: "Spare battery count", kind: "number" },
  { key: "charger_type", label: "Charger type", kind: "text" },
  { key: "earpiece_available", label: "Earpiece available", kind: "boolean" },
  {
    key: "shoulder_microphone_available",
    label: "Shoulder microphone available",
    kind: "boolean",
  },
  { key: "assigned_call_sign", label: "Assigned call sign", kind: "text" },
  { key: "assigned_team_position", label: "Assigned team position", kind: "text" },
  { key: "last_programming_date", label: "Last programming date", kind: "date" },
  { key: "firmware_version", label: "Firmware version", kind: "text" },
  { key: "radio_id", label: "Radio ID", kind: "text" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const CAMERA_FIELDS: DetailFieldDef[] = [
  { key: "camera_type", label: "Camera type", kind: "select", options: CAMERA_TYPES },
  {
    key: "indoor_outdoor",
    label: "Indoor or outdoor",
    kind: "select",
    options: [
      { value: "indoor", label: "Indoor" },
      { value: "outdoor", label: "Outdoor" },
      { value: "both", label: "Both" },
    ],
  },
  { key: "resolution", label: "Resolution", kind: "text" },
  { key: "lens_type", label: "Lens type", kind: "text" },
  { key: "field_of_view", label: "Field of view", kind: "text" },
  { key: "ptz_capable", label: "PTZ capable", kind: "boolean" },
  { key: "audio_capable", label: "Audio capable", kind: "boolean" },
  { key: "audio_enabled", label: "Audio enabled", kind: "boolean" },
  { key: "infrared_night_vision", label: "Infrared / night vision", kind: "boolean" },
  { key: "analytics_capable", label: "Analytics capable", kind: "boolean" },
  { key: "recording_enabled", label: "Recording enabled", kind: "boolean" },
  { key: "recording_destination", label: "Recording destination", kind: "text" },
  { key: "video_platform", label: "Video platform", kind: "text" },
  { key: "camera_channel", label: "Camera channel", kind: "text" },
  {
    key: "ip_address",
    label: "IP address",
    kind: "text",
    sensitive: true,
    hint: "No stream or admin passwords.",
  },
  { key: "mac_address", label: "MAC address", kind: "text", sensitive: true },
  {
    key: "vlan",
    label: "VLAN",
    kind: "text",
    sensitive: true,
    hint: "Virtual LAN identifier for this camera.",
  },
  {
    key: "poe_enabled",
    label: "PoE enabled",
    kind: "boolean",
    hint: "Power over Ethernet.",
  },
  {
    key: "onvif_supported",
    label: "ONVIF supported",
    kind: "boolean",
    hint: "Open Network Video Interface Forum.",
  },
  {
    key: "rtsp_supported",
    label: "RTSP supported",
    kind: "boolean",
    hint: "Do not store RTSP credentials.",
  },
  { key: "firmware_version", label: "Firmware version", kind: "text" },
  { key: "coverage_area", label: "Coverage area", kind: "text" },
  { key: "privacy_masking_enabled", label: "Privacy masking enabled", kind: "boolean" },
  { key: "retention_days", label: "Retention days", kind: "number" },
  {
    key: "last_image_verification_date",
    label: "Last image verification",
    kind: "date",
  },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const VIDEO_RECORDER_FIELDS: DetailFieldDef[] = [
  {
    key: "recorder_type",
    label: "Recorder type",
    kind: "select",
    options: [
      { value: "nvr", label: "NVR" },
      { value: "dvr", label: "DVR" },
      { value: "hybrid", label: "Hybrid" },
      { value: "cloud", label: "Cloud" },
      { value: "other", label: "Other" },
    ],
  },
  { key: "channel_capacity", label: "Channel capacity", kind: "number" },
  { key: "channels_in_use", label: "Channels in use", kind: "number" },
  { key: "storage_capacity", label: "Storage capacity", kind: "text" },
  { key: "raid_configuration", label: "RAID configuration", kind: "text" },
  { key: "estimated_retention_days", label: "Estimated retention days", kind: "number" },
  { key: "video_platform", label: "Video platform", kind: "text" },
  { key: "ip_address", label: "IP address", kind: "text", sensitive: true },
  { key: "mac_address", label: "MAC address", kind: "text", sensitive: true },
  { key: "vlan", label: "VLAN", kind: "text", sensitive: true },
  { key: "firmware_version", label: "Firmware version", kind: "text" },
  { key: "remote_access_enabled", label: "Remote access enabled", kind: "boolean" },
  { key: "cloud_connected", label: "Cloud connected", kind: "boolean" },
  { key: "ups_protected", label: "UPS protected", kind: "boolean" },
  { key: "last_backup_verification", label: "Last backup verification", kind: "date" },
  { key: "last_playback_test", label: "Last playback test", kind: "date" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const NETWORK_FIELDS: DetailFieldDef[] = [
  {
    key: "device_type",
    label: "Device type",
    kind: "select",
    options: NETWORK_DEVICE_TYPES,
  },
  { key: "hostname", label: "Hostname", kind: "text" },
  { key: "ip_address", label: "IP address", kind: "text", sensitive: true },
  { key: "mac_address", label: "MAC address", kind: "text", sensitive: true },
  { key: "management_ip", label: "Management IP", kind: "text", sensitive: true },
  { key: "vlan", label: "VLAN", kind: "text", sensitive: true },
  { key: "subnet", label: "Subnet", kind: "text", sensitive: true },
  { key: "network_zone", label: "Network zone", kind: "text" },
  {
    key: "poe_capability",
    label: "PoE capability",
    kind: "boolean",
    hint: "Power over Ethernet.",
  },
  { key: "poe_budget", label: "PoE budget", kind: "text" },
  { key: "port_count", label: "Port count", kind: "number" },
  { key: "ports_in_use", label: "Ports in use", kind: "number" },
  { key: "internet_facing", label: "Internet-facing", kind: "boolean" },
  {
    key: "managed_or_unmanaged",
    label: "Managed or unmanaged",
    kind: "select",
    options: [
      { value: "managed", label: "Managed" },
      { value: "unmanaged", label: "Unmanaged" },
    ],
  },
  { key: "manufacturer_os", label: "Manufacturer OS", kind: "text" },
  { key: "firmware_version", label: "Firmware version", kind: "text" },
  {
    key: "configuration_backup_location_ref",
    label: "Config backup location reference",
    kind: "text",
    hint: "Store a reference only — never paste secrets or full configs.",
  },
  { key: "last_configuration_backup", label: "Last configuration backup", kind: "date" },
  { key: "last_firmware_review", label: "Last firmware review", kind: "date" },
  { key: "monitoring_enabled", label: "Monitoring enabled", kind: "boolean" },
  { key: "ups_protected", label: "UPS protected", kind: "boolean" },
  { key: "redundancy_available", label: "Redundancy available", kind: "boolean" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const ACCESS_FIELDS: DetailFieldDef[] = [
  {
    key: "device_type",
    label: "Device type",
    kind: "select",
    options: ACCESS_CONTROL_TYPES,
  },
  { key: "controlled_door_or_area", label: "Controlled door or area", kind: "text" },
  { key: "reader_type", label: "Reader type", kind: "text" },
  { key: "credential_type", label: "Credential type", kind: "text" },
  { key: "lock_type", label: "Lock type", kind: "text" },
  {
    key: "fail_safe_or_secure",
    label: "Fail-safe or fail-secure",
    kind: "select",
    options: [
      { value: "fail_safe", label: "Fail-safe" },
      { value: "fail_secure", label: "Fail-secure" },
    ],
  },
  { key: "door_position_sensor", label: "Door position sensor", kind: "boolean" },
  { key: "request_to_exit_device", label: "Request-to-exit device", kind: "boolean" },
  {
    key: "emergency_release_available",
    label: "Emergency release available",
    kind: "boolean",
  },
  { key: "battery_backup", label: "Battery backup", kind: "boolean" },
  { key: "network_connected", label: "Network-connected", kind: "boolean" },
  { key: "ip_address", label: "IP address", kind: "text", sensitive: true },
  { key: "firmware_version", label: "Firmware version", kind: "text" },
  { key: "last_functional_test", label: "Last functional test", kind: "date" },
  {
    key: "notes",
    label: "Technical notes",
    kind: "textarea",
    hint: "Do not store door codes or credentials.",
  },
];

const ALARM_FIELDS: DetailFieldDef[] = [
  {
    key: "device_type",
    label: "Device type",
    kind: "select",
    options: ALARM_DEVICE_TYPES,
  },
  { key: "monitored_by", label: "Monitored by", kind: "text" },
  {
    key: "monitoring_account_reference",
    label: "Monitoring account reference",
    kind: "text",
    hint: "Reference only — never store alarm or installer codes.",
  },
  { key: "location_note", label: "Location note", kind: "text" },
  {
    key: "silent_or_audible",
    label: "Silent or audible",
    kind: "select",
    options: [
      { value: "silent", label: "Silent" },
      { value: "audible", label: "Audible" },
      { value: "both", label: "Both" },
    ],
  },
  {
    key: "fixed_or_wireless",
    label: "Fixed or wireless",
    kind: "select",
    options: [
      { value: "fixed", label: "Fixed" },
      { value: "wireless", label: "Wireless" },
    ],
  },
  { key: "battery_powered", label: "Battery-powered", kind: "boolean" },
  { key: "last_test_date", label: "Last test date", kind: "date" },
  { key: "next_test_date", label: "Next test date", kind: "date" },
  { key: "escalation_group", label: "Escalation group", kind: "text" },
  { key: "police_dispatch_enabled", label: "Police dispatch enabled", kind: "boolean" },
  { key: "medical_dispatch_enabled", label: "Medical dispatch enabled", kind: "boolean" },
  { key: "fire_dispatch_enabled", label: "Fire dispatch enabled", kind: "boolean" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const SENSOR_FIELDS: DetailFieldDef[] = [
  { key: "sensor_type", label: "Sensor type", kind: "select", options: SENSOR_TYPES },
  { key: "connectivity_type", label: "Connectivity type", kind: "text" },
  { key: "reporting_protocol", label: "Reporting protocol", kind: "text" },
  { key: "measurement_unit", label: "Measurement unit", kind: "text" },
  { key: "normal_threshold", label: "Normal threshold", kind: "text" },
  { key: "warning_threshold", label: "Warning threshold", kind: "text" },
  { key: "critical_threshold", label: "Critical threshold", kind: "text" },
  { key: "battery_powered", label: "Battery-powered", kind: "boolean" },
  { key: "battery_level", label: "Battery level", kind: "text" },
  { key: "calibration_required", label: "Calibration required", kind: "boolean" },
  { key: "last_calibration_date", label: "Last calibration date", kind: "date" },
  { key: "next_calibration_date", label: "Next calibration date", kind: "date" },
  { key: "alerting_enabled", label: "Alerting enabled", kind: "boolean" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const POWER_FIELDS: DetailFieldDef[] = [
  { key: "equipment_type", label: "Equipment type", kind: "select", options: POWER_TYPES },
  { key: "capacity", label: "Capacity", kind: "text" },
  { key: "battery_chemistry", label: "Battery chemistry", kind: "text" },
  { key: "runtime_estimate", label: "Runtime estimate", kind: "text" },
  { key: "protected_equipment", label: "Protected equipment", kind: "text" },
  { key: "input_voltage", label: "Input voltage", kind: "text" },
  { key: "output_voltage", label: "Output voltage", kind: "text" },
  {
    key: "network_management_available",
    label: "Network management available",
    kind: "boolean",
  },
  { key: "last_battery_test", label: "Last battery test", kind: "date" },
  { key: "battery_replacement_date", label: "Battery replacement date", kind: "date" },
  { key: "next_battery_replacement", label: "Next battery replacement", kind: "date" },
  { key: "generator_backed", label: "Generator-backed", kind: "boolean" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

const FIRST_RESPONSE_FIELDS: DetailFieldDef[] = [
  {
    key: "equipment_type",
    label: "Equipment type",
    kind: "select",
    options: FIRST_RESPONSE_TYPES,
  },
  { key: "seal_number", label: "Seal number", kind: "text" },
  { key: "inspection_interval_days", label: "Inspection interval (days)", kind: "number" },
  { key: "last_inspection_date", label: "Last inspection date", kind: "date" },
  { key: "next_inspection_date", label: "Next inspection date", kind: "date" },
  { key: "expiration_date", label: "Expiration date", kind: "date" },
  { key: "supply_status", label: "Supply status", kind: "text" },
  { key: "assigned_location", label: "Assigned location", kind: "text" },
  { key: "notes", label: "Technical notes", kind: "textarea" },
];

export function fieldsForDetailTable(
  table: CategoryDetailTable,
): DetailFieldDef[] {
  switch (table) {
    case "radio_details":
      return RADIO_FIELDS;
    case "camera_details":
      return CAMERA_FIELDS;
    case "video_recorder_details":
      return VIDEO_RECORDER_FIELDS;
    case "network_device_details":
      return NETWORK_FIELDS;
    case "access_control_details":
      return ACCESS_FIELDS;
    case "alarm_device_details":
      return ALARM_FIELDS;
    case "sensor_details":
      return SENSOR_FIELDS;
    case "power_backup_details":
      return POWER_FIELDS;
    case "first_response_details":
      return FIRST_RESPONSE_FIELDS;
  }
}

export function fieldsForCategory(category: EquipmentCategory): DetailFieldDef[] {
  const table = detailTableForCategory(category);
  return table ? fieldsForDetailTable(table) : [];
}

function formKey(fieldKey: string): string {
  return `detail_${fieldKey}`;
}

export function parseCategoryDetailsFromForm(
  formData: FormData,
  category: EquipmentCategory,
): { table: CategoryDetailTable; values: CategoryDetailRecord } | null {
  const table = detailTableForCategory(category);
  if (!table) return null;

  const values: CategoryDetailRecord = {};
  let hasAny = false;

  for (const field of fieldsForDetailTable(table)) {
    const key = formKey(field.key);
    if (field.kind === "boolean") {
      const checked =
        String(formData.get(key) ?? "") === "on" ||
        String(formData.get(key) ?? "") === "true";
      values[field.key] = checked;
      if (checked) hasAny = true;
      continue;
    }

    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) {
      values[field.key] = null;
      continue;
    }

    hasAny = true;

    if (field.kind === "number") {
      const num = Number(raw);
      values[field.key] = Number.isFinite(num) ? num : null;
      continue;
    }

    if (field.kind === "date") {
      values[field.key] = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
      continue;
    }

    values[field.key] = raw.slice(0, field.kind === "textarea" ? 4000 : 200);
  }

  if (!hasAny) {
    return { table, values };
  }

  return { table, values };
}

export function labelForDetailOption(
  field: DetailFieldDef,
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.kind === "select" && field.options) {
    const match = field.options.find((item) => item.value === String(value));
    return match?.label ?? String(value);
  }
  return String(value);
}

export function titleForDetailTable(table: CategoryDetailTable): string {
  switch (table) {
    case "radio_details":
      return "Radio details";
    case "camera_details":
      return "Camera details";
    case "video_recorder_details":
      return "Video recorder details";
    case "network_device_details":
      return "Network device details";
    case "access_control_details":
      return "Access-control details";
    case "alarm_device_details":
      return "Alarm / panic details";
    case "sensor_details":
      return "Sensor details";
    case "power_backup_details":
      return "Power and backup details";
    case "first_response_details":
      return "First-response details";
  }
}

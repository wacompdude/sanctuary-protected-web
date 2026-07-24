/**
 * Stable application feature keys.
 * Plan assignments live in the database (plan_features); do not encode
 * plan matrices by checking plan names in feature code.
 */
export const FEATURE_KEYS = {
  USERS_ACTIVE_LIMIT: "users.active.limit",

  INCIDENT_LOGGING: "incidents.logging.enabled",
  INCIDENT_PHOTOS: "incidents.photos.enabled",
  INCIDENT_PHOTO_COUNT_LIMIT: "incidents.photos.max_count_per_incident",
  INCIDENT_PHOTO_SIZE_LIMIT_MB: "incidents.photos.max_size_mb",

  GROUP_EMAIL: "messaging.group_email.enabled",
  EMAIL: "messaging.email.enabled",
  SMS: "messaging.sms.enabled",
  SMS_MONTHLY_SEGMENT_LIMIT: "messaging.sms.monthly_segment_limit",

  TEAM_SCHEDULING: "scheduling.team.enabled",

  MEDICAL_INVENTORY: "medical.inventory.enabled",
  MEDICAL_INCIDENT_USAGE: "medical.incident_usage.enabled",

  HARDWARE_INVENTORY: "hardware.inventory.enabled",
  HARDWARE_PHOTOS: "hardware.photos.enabled",

  POLICIES: "policies.enabled",

  STANDARD_ANALYTICS: "analytics.standard.enabled",
  ADVANCED_ANALYTICS: "analytics.advanced.enabled",

  MULTI_CAMPUS: "campuses.multiple.enabled",
  CAMPUS_LIMIT: "campuses.maximum_count",

  CAMERAS: "cameras.enabled",
  SENSORS: "sensors.enabled",
  SENSOR_ALARMS: "sensor_alarms.enabled",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const FEATURE_KEY_LIST: readonly FeatureKey[] = Object.values(
  FEATURE_KEYS,
);

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEY_LIST as readonly string[]).includes(value);
}

/** Human labels for upgrade / limit messages (not for authorization). */
export const FEATURE_DISPLAY_NAMES: Record<FeatureKey, string> = {
  [FEATURE_KEYS.USERS_ACTIVE_LIMIT]: "Active users",
  [FEATURE_KEYS.INCIDENT_LOGGING]: "Incident logging",
  [FEATURE_KEYS.INCIDENT_PHOTOS]: "Incident photos",
  [FEATURE_KEYS.INCIDENT_PHOTO_COUNT_LIMIT]: "Photos per incident",
  [FEATURE_KEYS.INCIDENT_PHOTO_SIZE_LIMIT_MB]: "Incident photo size",
  [FEATURE_KEYS.GROUP_EMAIL]: "Group email messaging",
  [FEATURE_KEYS.EMAIL]: "Email messaging",
  [FEATURE_KEYS.SMS]: "SMS messaging",
  [FEATURE_KEYS.SMS_MONTHLY_SEGMENT_LIMIT]: "SMS segments",
  [FEATURE_KEYS.TEAM_SCHEDULING]: "Team scheduling",
  [FEATURE_KEYS.MEDICAL_INVENTORY]: "Medical inventory",
  [FEATURE_KEYS.MEDICAL_INCIDENT_USAGE]: "Medical supplies on incidents",
  [FEATURE_KEYS.HARDWARE_INVENTORY]: "Hardware inventory",
  [FEATURE_KEYS.HARDWARE_PHOTOS]: "Hardware photos",
  [FEATURE_KEYS.POLICIES]: "Policies and procedures",
  [FEATURE_KEYS.STANDARD_ANALYTICS]: "Standard analytics",
  [FEATURE_KEYS.ADVANCED_ANALYTICS]: "Advanced analytics",
  [FEATURE_KEYS.MULTI_CAMPUS]: "Multi-campus management",
  [FEATURE_KEYS.CAMPUS_LIMIT]: "Campus limit",
  [FEATURE_KEYS.CAMERAS]: "Cameras",
  [FEATURE_KEYS.SENSORS]: "Sensors",
  [FEATURE_KEYS.SENSOR_ALARMS]: "Sensor alarms",
};

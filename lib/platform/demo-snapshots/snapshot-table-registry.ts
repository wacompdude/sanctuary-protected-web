/**
 * Authoritative registry for demo organization snapshot export / restore.
 * Do not hard-code alternate table lists in services — import from here.
 *
 * Customer UI still says "Church"; table names are organization_*.
 */

export type SnapshotRestoreStrategy =
  | "replace"
  | "preserve"
  | "merge"
  | "exclude";

export type SnapshotTableDefinition = {
  tableName: string;
  /** Column that scopes rows to the demo organization. Absent ⇒ special handling. */
  organizationScopeColumn?: "organization_id";
  /**
   * Lower numbers export/insert first; delete runs in reverse.
   * Leave gaps for future inserts.
   */
  dependencyOrder: number;
  restoreStrategy: SnapshotRestoreStrategy;
  containsStorageReferences: boolean;
  sensitive: boolean;
  required: boolean;
  notes?: string;
};

/**
 * Snapshot format version written into manifests.
 * Bump when export shape changes incompatibly.
 */
export const DEMO_SNAPSHOT_FORMAT_VERSION = 1;

/**
 * App-facing schema version stamp for compatibility checks.
 * Align with latest applied migration number when Phase 3 lands.
 */
export const DEMO_DATABASE_SCHEMA_VERSION = "080";

export const DEMO_SNAPSHOT_STORAGE_BUCKET = "demo-organization-snapshots";

export const DEMO_INTERNAL_BILLING_PROVIDER = "internal_demo";

export const DEMO_RESTORE_CONFIRMATION_PHRASE =
  "RESTORE FIRST CHURCH DEMO" as const;

export const DEMO_SAFETY_SNAPSHOT_RETENTION_DAYS_DEFAULT = 14;

/** Platform permission keys introduced for this feature (seeded in SQL). */
export const DEMO_SNAPSHOT_PERMISSIONS = [
  "demo_organizations.read",
  "demo_organizations.manage",
  "demo_snapshots.read",
  "demo_snapshots.create",
  "demo_snapshots.restore",
  "demo_snapshots.archive",
  "demo_snapshots.delete",
  "demo_snapshots.protect",
  "demo_snapshots.set_default",
  "demo_restores.rollback",
  "demo_restores.unlock",
] as const;

export type DemoSnapshotPermissionKey =
  (typeof DEMO_SNAPSHOT_PERMISSIONS)[number];

/**
 * Complete registry. Strategies:
 * - replace: delete org-scoped rows then insert from snapshot
 * - merge: keep Auth user_id; upsert membership / prefs from snapshot
 * - preserve: never delete/overwrite from snapshot payload
 * - exclude: never exported or restored
 */
export const SNAPSHOT_TABLE_REGISTRY: SnapshotTableDefinition[] = [
  // —— Organization root ——
  {
    tableName: "organizations",
    organizationScopeColumn: "organization_id", // self: filter by id
    dependencyOrder: 10,
    restoreStrategy: "merge",
    containsStorageReferences: true, // logo_path
    sensitive: false,
    required: true,
    notes:
      "Update in place; preserve id, seed_source, is_demo_* flags, billing scrub fields.",
  },

  // —— Settings (1:1) ——
  {
    tableName: "organization_notification_settings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 20,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "organization_schedule_settings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 21,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "organization_policy_settings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 22,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_organization_settings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 23,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "organization_role_settings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 24,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "dashboard_box_settings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 25,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "organization_contacts",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 26,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "organization_threat_levels",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 27,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Campuses ——
  {
    tableName: "campuses",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 40,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: false,
    required: true,
  },
  {
    tableName: "campus_locations",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 41,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Memberships (merge protected accounts) ——
  {
    tableName: "organization_memberships",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 50,
    restoreStrategy: "merge",
    containsStorageReferences: false,
    sensitive: true,
    required: true,
    notes: "Preserve user_id for demo_protected_accounts; never delete Auth users.",
  },
  {
    tableName: "organization_membership_roles",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 51,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "campus_memberships",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 52,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "organization_invitations",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 53,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
    notes: "Do not send invitation emails on restore.",
  },
  {
    tableName: "team_members",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 54,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Tenant security groups / permissions ——
  {
    tableName: "security_groups",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 60,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "security_group_members",
    dependencyOrder: 61,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
    notes: "Scoped via security_groups.organization_id",
  },
  {
    tableName: "security_group_permissions",
    dependencyOrder: 62,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
    notes: "Scoped via security_groups.organization_id",
  },
  {
    tableName: "user_permissions",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 63,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "security_audit_logs",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 64,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },

  // —— Demo subscription state (scrub provider IDs) ——
  {
    tableName: "organization_subscriptions",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 70,
    restoreStrategy: "merge",
    containsStorageReferences: false,
    sensitive: true,
    required: true,
    notes:
      "Force billing_provider=internal_demo; refuse if live paid provider IDs present without scrub.",
  },
  {
    tableName: "organization_entitlement_overrides",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 71,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "subscription_change_history",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 72,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "subscription_usage",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 73,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "subscription_usage_events",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 74,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Notifications (structure + prefs; not live deliveries) ——
  {
    tableName: "notification_groups",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 80,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_group_members",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 81,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_group_defaults",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 82,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_group_nestings",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 83,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_endpoints",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 84,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "notification_targets",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 85,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_preferences",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 86,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_preference_rules",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 87,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_templates",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 88,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notifications",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 89,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
    notes: "Import as historical only; never mark pending for dispatch.",
  },
  {
    tableName: "notification_recipients",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 90,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "notification_deliveries",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 91,
    restoreStrategy: "exclude",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
    notes: "Exclude to avoid re-sending; optional historical import later.",
  },

  // —— Incidents ——
  {
    tableName: "incidents",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 100,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "incident_updates",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 101,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "incident_attachments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 102,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: true,
    required: false,
  },
  {
    tableName: "incident_team_members",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 103,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "events",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 104,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Scheduling ——
  {
    tableName: "schedule_templates",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 110,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "schedule_events",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 111,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "schedule_shifts",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 112,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "shift_assignments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 113,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "member_unavailability",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 114,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "schedule_change_history",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 115,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "schedule_reminder_keys",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 116,
    restoreStrategy: "exclude",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
    notes: "Dedup keys for cron; exclude to avoid false suppressions.",
  },

  // —— Hardware ——
  {
    tableName: "security_equipment",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 120,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: false,
    required: false,
  },
  {
    tableName: "radio_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 121,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "camera_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 122,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "video_recorder_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 123,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "network_device_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 124,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "access_control_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 125,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "alarm_device_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 126,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "sensor_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 127,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "power_backup_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 128,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "first_response_details",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 129,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "equipment_relationships",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 130,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "equipment_assignments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 131,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "equipment_maintenance",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 132,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: false,
    required: false,
  },
  {
    tableName: "equipment_attachments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 133,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: false,
    required: false,
  },

  // —— Medical ——
  {
    tableName: "medical_supplies",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 140,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "medical_supply_usage",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 141,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Policies ——
  {
    tableName: "policy_categories",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 150,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_tags",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 151,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_documents",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 152,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_versions",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 153,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_document_tags",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 154,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_attachments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 155,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_approvals",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 156,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_assignments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 157,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_acknowledgments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 158,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "policy_review_history",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 159,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Training (org-scoped only; system catalog excluded) ——
  {
    tableName: "training_categories",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 170,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
    notes: "Export WHERE organization_id = demo only.",
  },
  {
    tableName: "training_category_church_state",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 171,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_courses",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 172,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_course_church_state",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 173,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_events",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 174,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_event_assignments",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 175,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_participants",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 176,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_requirements",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 177,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_completion_records",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 178,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_external_records",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 179,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },
  {
    tableName: "training_documents",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 180,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: false,
    required: false,
  },
  {
    tableName: "certifications",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 181,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
  },

  // —— Safety concerns ——
  {
    tableName: "safety_concern_profiles",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 190,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "safety_concern_profile_campuses",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 191,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "safety_concern_photos",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 192,
    restoreStrategy: "replace",
    containsStorageReferences: true,
    sensitive: true,
    required: false,
  },
  {
    tableName: "safety_concern_reviews",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 193,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "safety_concern_incidents",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 194,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },

  // —— Tenant audit (optional replace) ——
  {
    tableName: "audit_logs",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 200,
    restoreStrategy: "replace",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
    notes: "Demo audit trail only; platform_admin_actions excluded.",
  },

  // —— Explicit excludes (documented) ——
  {
    tableName: "billing_customers",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 900,
    restoreStrategy: "exclude",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "billing_events",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 901,
    restoreStrategy: "exclude",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "notification_provider_events",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 902,
    restoreStrategy: "exclude",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "platform_access_sessions",
    organizationScopeColumn: "organization_id",
    dependencyOrder: 903,
    restoreStrategy: "exclude",
    containsStorageReferences: false,
    sensitive: true,
    required: false,
  },
  {
    tableName: "demo_seed_records",
    dependencyOrder: 904,
    restoreStrategy: "preserve",
    containsStorageReferences: false,
    sensitive: false,
    required: false,
    notes: "Seed registry may be refreshed after restore; not snapshot payload.",
  },
  {
    tableName: "profiles",
    dependencyOrder: 905,
    restoreStrategy: "preserve",
    containsStorageReferences: true,
    sensitive: true,
    required: false,
    notes: "Auth-linked; update display fields only for protected users if needed.",
  },
];

export function tablesForStrategy(strategy: SnapshotRestoreStrategy) {
  return SNAPSHOT_TABLE_REGISTRY.filter((t) => t.restoreStrategy === strategy);
}

export function exportInsertOrder() {
  return [...SNAPSHOT_TABLE_REGISTRY]
    .filter((t) => t.restoreStrategy !== "exclude")
    .sort((a, b) => a.dependencyOrder - b.dependencyOrder);
}

export function deleteOrder() {
  return [...exportInsertOrder()].reverse();
}

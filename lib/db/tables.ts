/**
 * Physical Supabase table names after migration 071 (Option A).
 * Column names like `church_id` and customer-facing "Church" UI are unchanged.
 */
export const TABLES = {
  organizations: "organizations",
  organizationMemberships: "organization_memberships",
  organizationMembershipRoles: "organization_membership_roles",
  organizationInvitations: "organization_invitations",
  organizationContacts: "organization_contacts",
  organizationThreatLevels: "organization_threat_levels",
  organizationNotificationSettings: "organization_notification_settings",
  organizationScheduleSettings: "organization_schedule_settings",
  organizationPolicySettings: "organization_policy_settings",
  organizationSubscriptions: "organization_subscriptions",
  organizationEntitlementOverrides: "organization_entitlement_overrides",
  organizationRoleSettings: "organization_role_settings",
  trainingOrganizationSettings: "training_organization_settings",
} as const;

export type OrganizationTableName = (typeof TABLES)[keyof typeof TABLES];

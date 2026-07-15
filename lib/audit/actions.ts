/**
 * Canonical audit action names for Sanctuary Protected.
 * Prefer these constants everywhere — do not invent ad-hoc strings.
 */
export const AuditAction = {
  CHURCH_CREATED: "church.created",
  CHURCH_SETTINGS_UPDATED: "church.settings_updated",
  CHURCH_SETTINGS_GENERAL_UPDATED: "church.settings.general_updated",
  CHURCH_SETTINGS_CONTACT_UPDATED: "church.settings.contact_updated",
  CHURCH_CONTACT_CREATED: "church.contact_created",
  CHURCH_CONTACT_UPDATED: "church.contact_updated",
  CHURCH_CONTACT_REMOVED: "church.contact_removed",
  CHURCH_SETTINGS_ADDRESS_UPDATED: "church.settings.address_updated",
  CHURCH_SETTINGS_BRANDING_UPDATED: "church.settings.branding_updated",
  CHURCH_SETTINGS_SECURITY_UPDATED: "church.settings.security_updated",
  CHURCH_SETTINGS_PREFERENCES_UPDATED: "church.settings.preferences_updated",
  CHURCH_LOGO_UPDATED: "church.logo_updated",
  CHURCH_ACCOUNT_SUSPENDED: "church.account_suspended",
  CHURCH_ACCOUNT_REACTIVATED: "church.account_reactivated",
  CHURCH_ACCOUNT_CLOSED: "church.account_closed",
  CAMPUS_CREATED: "campus.created",
  CAMPUS_UPDATED: "campus.updated",
  MEMBER_INVITED: "member.invited",
  MEMBER_PROVISIONED: "member.provisioned",
  INVITATION_RESENT: "invitation.resent",
  INVITATION_REVOKED: "invitation.revoked",
  INVITATION_ACCEPTED: "invitation.accepted",
  MEMBERSHIP_ROLE_CHANGED: "membership.role_changed",
  MEMBERSHIP_SUSPENDED: "membership.suspended",
  MEMBERSHIP_REMOVED: "membership.removed",
  MEMBERSHIP_REACTIVATED: "membership.reactivated",
  OWNERSHIP_TRANSFER_INITIATED: "ownership.transfer_initiated",
  OWNERSHIP_TRANSFER_COMPLETED: "ownership.transfer_completed",
  AUTH_LOGIN: "auth.login",
  INCIDENT_CREATED: "incident.created",
  INCIDENT_UPDATED: "incident.updated",
  CERTIFICATION_CREATED: "certification.created",
  CERTIFICATION_UPDATED: "certification.updated",
  CERTIFICATION_ARCHIVED: "certification.archived",
  CERTIFICATION_DELETED: "certification.deleted",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditEntityType = {
  CHURCH: "church",
  CAMPUS: "campus",
  CHURCH_INVITATION: "church_invitation",
  CHURCH_MEMBERSHIP: "church_membership",
  CHURCH_CONTACT: "church_contact",
  USER: "user",
  INCIDENT: "incident",
  CERTIFICATION: "certification",
} as const;

export type AuditEntityTypeName =
  (typeof AuditEntityType)[keyof typeof AuditEntityType];

export function labelForAuditAction(action: string): string {
  const labels: Record<string, string> = {
    [AuditAction.CHURCH_CREATED]: "Church created",
    [AuditAction.CHURCH_SETTINGS_UPDATED]: "Church settings updated",
    [AuditAction.CHURCH_SETTINGS_GENERAL_UPDATED]: "General settings updated",
    [AuditAction.CHURCH_SETTINGS_CONTACT_UPDATED]: "Contact settings updated",
    [AuditAction.CHURCH_CONTACT_CREATED]: "Church contact created",
    [AuditAction.CHURCH_CONTACT_UPDATED]: "Church contact updated",
    [AuditAction.CHURCH_CONTACT_REMOVED]: "Church contact removed",
    [AuditAction.CHURCH_SETTINGS_ADDRESS_UPDATED]: "Address settings updated",
    [AuditAction.CHURCH_SETTINGS_BRANDING_UPDATED]: "Branding settings updated",
    [AuditAction.CHURCH_SETTINGS_SECURITY_UPDATED]: "Security settings updated",
    [AuditAction.CHURCH_SETTINGS_PREFERENCES_UPDATED]:
      "Application preferences updated",
    [AuditAction.CHURCH_LOGO_UPDATED]: "Church logo updated",
    [AuditAction.CHURCH_ACCOUNT_SUSPENDED]: "Church account suspended",
    [AuditAction.CHURCH_ACCOUNT_REACTIVATED]: "Church account reactivated",
    [AuditAction.CHURCH_ACCOUNT_CLOSED]: "Church account closed",
    [AuditAction.CAMPUS_CREATED]: "Campus created",
    [AuditAction.CAMPUS_UPDATED]: "Campus updated",
    [AuditAction.MEMBER_INVITED]: "Member invited",
    [AuditAction.MEMBER_PROVISIONED]: "Member provisioned",
    [AuditAction.INVITATION_RESENT]: "Invitation resent",
    [AuditAction.INVITATION_REVOKED]: "Invitation revoked",
    [AuditAction.INVITATION_ACCEPTED]: "Invitation accepted",
    [AuditAction.MEMBERSHIP_ROLE_CHANGED]: "Membership role changed",
    [AuditAction.MEMBERSHIP_SUSPENDED]: "Membership suspended",
    [AuditAction.MEMBERSHIP_REMOVED]: "Membership removed",
    [AuditAction.MEMBERSHIP_REACTIVATED]: "Membership reactivated",
    [AuditAction.OWNERSHIP_TRANSFER_INITIATED]: "Owner transfer initiated",
    [AuditAction.OWNERSHIP_TRANSFER_COMPLETED]: "Owner transfer completed",
    [AuditAction.AUTH_LOGIN]: "User signed in",
    [AuditAction.INCIDENT_CREATED]: "Incident created",
    [AuditAction.INCIDENT_UPDATED]: "Incident updated",
    [AuditAction.CERTIFICATION_CREATED]: "Certification created",
    [AuditAction.CERTIFICATION_UPDATED]: "Certification updated",
    [AuditAction.CERTIFICATION_ARCHIVED]: "Certification archived",
    [AuditAction.CERTIFICATION_DELETED]: "Certification deleted",
    // Legacy rows from earlier phases
    "membership.invitation_created": "Member invited",
    "membership.invitation_accepted": "Invitation accepted",
    "membership.status_changed": "Membership status changed",
  };
  return labels[action] ?? action;
}

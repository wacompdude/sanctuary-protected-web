export type MembershipRole =
  | "owner"
  | "co_owner"
  | "administrator"
  | "security_leader"
  | "security_member"
  | "viewer"
  | "training_coordinator"
  | "medical_coordinator"
  | "hardware_manager"
  | "event_coordinator"
  | "pastor";

/** Specialist church roles (not in the linear security ladder). */
export const SPECIALIST_MEMBERSHIP_ROLES: MembershipRole[] = [
  "training_coordinator",
  "medical_coordinator",
  "hardware_manager",
  "event_coordinator",
  "pastor",
];

/** Primary owner or co-owner — shared administrative ownership tier. */
export function isOwnershipRole(role: MembershipRole | null | undefined): boolean {
  return role === "owner" || role === "co_owner";
}

/** @deprecated Use MembershipRole — kept for gradual migration */
export type AppRole = MembershipRole | "member";

/**
 * Membership status controls login / assignment eligibility — not privileges.
 * `invited` displays as "Pending Invitation". `removed` retained for legacy.
 */
export type MembershipStatus =
  | "invited"
  | "active"
  | "suspended"
  | "removed"
  | "inactive"
  | "pending_approval"
  | "on_leave"
  | "archived";

/** Status values that allow app login / active church context. */
export function membershipStatusAllowsLogin(
  status: MembershipStatus | string | null | undefined,
): boolean {
  return status === "active";
}

/** Status values eligible for schedule/event assignment (login still required separately). */
export function membershipStatusAllowsAssignment(
  status: MembershipStatus | string | null | undefined,
): boolean {
  return status === "active" || status === "on_leave";
}

export type ChurchStatus = "trial" | "active" | "suspended" | "closed";

export interface Church {
  id: string;
  name: string;
  status?: ChurchStatus | null;
  slug?: string | null;
  /** IANA timezone used for all church-scoped timestamps (e.g. America/Chicago). */
  timezone?: string | null;
  /**
   * First day of the church calendar week: 0=Sunday … 6=Saturday.
   * Used by weekly threat levels and other week-scoped features.
   */
  week_starts_on?: number | null;
}

export interface Profile {
  id: string;
  /** Active church from resolved context (not stored on profiles). */
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  /** Role from the active church membership. */
  role: MembershipRole;
}

export interface ChurchMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  joined_at: string | null;
  created_at: string | null;
}

export interface ChurchMembershipWithChurch extends ChurchMembership {
  church: Church;
}

export type ActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
  invitationUrl?: string;
  invitationId?: string;
};

export const CERT_MANAGEMENT_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
  "security_leader",
];

export function canManageCertifications(role: MembershipRole | AppRole): boolean {
  if (role === "member") return false;
  return CERT_MANAGEMENT_ROLES.includes(role as MembershipRole);
}

export function normalizeMembershipRole(
  role: string | null | undefined,
): MembershipRole {
  switch (role) {
    case "owner":
    case "co_owner":
    case "administrator":
    case "security_leader":
    case "security_member":
    case "viewer":
    case "training_coordinator":
    case "medical_coordinator":
    case "hardware_manager":
    case "event_coordinator":
    case "pastor":
      return role;
    case "member":
      return "security_member";
    default:
      return "viewer";
  }
}

export function isUsableChurchStatus(
  status: string | null | undefined,
): boolean {
  return !status || status === "trial" || status === "active";
}

/** Ownership-tier members may keep context on suspended/closed churches for recovery. */
export function isOwnerRecoveryChurchStatus(
  status: string | null | undefined,
): boolean {
  return status === "suspended" || status === "closed";
}

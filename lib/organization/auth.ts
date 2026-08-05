import {
  requireOrganizationMembership,
  requireOperationalOrganization,
} from "@/lib/organization/context";

export { ChurchAccessError } from "@/lib/organization/errors";
export {
  getCurrentUser,
  getUserMemberships,
  getActiveOrganization,
  getActiveChurch,
  requireOrganizationMembership,
  requireChurchMembership,
  requireOperationalOrganization,
  requireOperationalChurch,
  requireOrganizationRole,
  requireChurchRole,
  requireMinOrganizationRole,
  requireMinChurchRole,
  setActiveOrganizationForUser,
  setActiveChurchForUser,
} from "@/lib/organization/context";

/**
 * Backward-compatible church context used by existing pages/actions.
 * Prefer requireOrganizationMembership() for new service code.
 * UI may keep calling the Church-named helpers.
 */
export async function getAuthenticatedUserWithChurch() {
  const context = await requireOrganizationMembership();

  return {
    supabase: context.supabase,
    user: context.user,
    profile: context.profile,
    church: context.church,
    membership: {
      id: context.membership.id,
      organization_id: context.membership.organization_id,
      user_id: context.membership.user_id,
      role: context.membership.role,
      status: context.membership.status,
    },
    memberships: context.memberships,
    canManageCertifications: context.canManageCertifications,
    cookieSyncOrganizationId: context.cookieSyncOrganizationId,
  };
}

/** Same as getAuthenticatedUserWithChurch but rejects suspended/closed organizations. */
export async function getOperationalChurchContext() {
  const context = await requireOperationalOrganization();

  return {
    supabase: context.supabase,
    user: context.user,
    profile: context.profile,
    church: context.church,
    membership: {
      id: context.membership.id,
      organization_id: context.membership.organization_id,
      user_id: context.membership.user_id,
      role: context.membership.role,
      status: context.membership.status,
    },
    memberships: context.memberships,
    canManageCertifications: context.canManageCertifications,
    cookieSyncOrganizationId: context.cookieSyncOrganizationId,
  };
}

/** Alias for service-layer naming consistency. */
export const getAuthenticatedUserWithOrganization = getAuthenticatedUserWithChurch;

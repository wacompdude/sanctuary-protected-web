import { requireChurchMembership } from "@/lib/church/context";

export { ChurchAccessError } from "@/lib/church/errors";
export {
  getCurrentUser,
  getUserMemberships,
  getActiveChurch,
  requireChurchMembership,
  requireChurchRole,
  requireMinChurchRole,
  setActiveChurchForUser,
} from "@/lib/church/context";

/**
 * Backward-compatible church context used by existing pages/actions.
 * Prefer requireChurchMembership() / requireChurchRole() for new code.
 */
export async function getAuthenticatedUserWithChurch() {
  const context = await requireChurchMembership();

  return {
    supabase: context.supabase,
    user: context.user,
    profile: context.profile,
    church: context.church,
    membership: {
      church_id: context.membership.church_id,
      role: context.membership.role,
      status: context.membership.status,
    },
    memberships: context.memberships,
    canManageCertifications: context.canManageCertifications,
    cookieSyncChurchId: context.cookieSyncChurchId,
  };
}

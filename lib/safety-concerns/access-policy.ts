import type { MembershipRole } from "@/lib/organization/types";
import {
  canManageSafetyConcerns,
  canViewSafetyConcernsWhenEntitled,
} from "@/lib/safety-concerns/permissions";

/**
 * Pure access evaluation — safe for Expo / React Native UI gating.
 * Does not call Next cookies, React cache, or the entitlement resolver.
 * Server routes should still enforce RLS + requireFeature on mutations.
 */
export type SafetyConcernAccessDecision = {
  entitled: boolean;
  readOnly: boolean;
  canRead: boolean;
  canWrite: boolean;
  reason?: string;
  upgradeMessage: string;
};

export function evaluateSafetyConcernAccess(params: {
  entitled: boolean;
  role: MembershipRole;
  /** Church setting — only applies when entitled. */
  allowSecurityMemberView?: boolean;
  reason?: string;
}): SafetyConcernAccessDecision {
  const allowSecurityMemberView = params.allowSecurityMemberView !== false;
  const isManager = canManageSafetyConcerns(params.role);
  const upgradeMessage =
    params.reason ??
    "Known Safety Concerns is not included in your current plan. Upgrade to unlock editing.";

  if (params.entitled) {
    const canRead =
      isManager ||
      (canViewSafetyConcernsWhenEntitled(params.role) &&
        allowSecurityMemberView);
    return {
      entitled: true,
      readOnly: false,
      canRead,
      canWrite: isManager,
      reason: undefined,
      upgradeMessage,
    };
  }

  if (isManager) {
    return {
      entitled: false,
      readOnly: true,
      canRead: true,
      canWrite: false,
      reason: params.reason,
      upgradeMessage,
    };
  }

  return {
    entitled: false,
    readOnly: false,
    canRead: false,
    canWrite: false,
    reason: params.reason,
    upgradeMessage,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampusRole } from "@/lib/campuses/types";
import type { MembershipRole } from "@/lib/organization/types";
import { canUserPerform } from "@/lib/security/authorization";
import {
  capabilitiesFromResults,
  capabilitiesFromTopLevelAdmin,
  denialMessageForCampusAction,
  evaluateCampusAccessFromChurchRole,
  evaluateLegacyCampusRole,
  impliedPermissionKeysForAction,
  isTopLevelCampusAction,
  isTopLevelCampusAdminRole,
  isTopLevelCampusPermission,
  type CampusAction,
  type CampusAuthReason,
  type CampusAuthResult,
  type CampusCapabilities,
} from "@/lib/campuses/campus-policy";

export * from "@/lib/campuses/campus-policy";

/**
 * Central campus authorization. Top-level actions require Owner / Co-owner /
 * Administrator and ignore ordinary group grants. Delegable actions honor
 * security groups, direct grants, and campus-scoped assignments.
 */
export async function canManageCampus(params: {
  actorUserId: string;
  organizationId: string;
  campusId?: string | null;
  action: CampusAction;
  churchRole: MembershipRole | string;
  campusRole?: CampusRole | string | null;
  campusName?: string | null;
  admin?: SupabaseClient;
  now?: Date;
}): Promise<CampusAuthResult> {
  const fromRole = evaluateCampusAccessFromChurchRole(
    params.churchRole,
    params.action,
    params.campusName,
  );
  if (fromRole.allowed) return fromRole;
  if (isTopLevelCampusAction(params.action)) return fromRole;

  if (params.admin) {
    const keys = impliedPermissionKeysForAction(params.action);
    for (const permissionKey of keys) {
      const result = await canUserPerform(params.admin, {
        userId: params.actorUserId,
        organizationId: params.organizationId,
        campusId: params.campusId ?? undefined,
        permissionKey,
        actionDate: params.now,
      });
      if (result.allowed) {
        if (isTopLevelCampusPermission(permissionKey) && result.source !== "ROLE") {
          continue;
        }
        const reason: CampusAuthReason =
          result.source === "GROUP"
            ? "GROUP_PERMISSION"
            : result.source === "DIRECT"
              ? "DIRECT_PERMISSION"
              : "ROLE_PERMISSION";
        return {
          allowed: true,
          reason,
          source: result.source,
          scope: params.campusName ?? params.campusId ?? undefined,
          message: result.message,
          permissionKey,
        };
      }
      if (result.reason === "CAMPUS_ACCESS_DENIED") {
        return {
          allowed: false,
          reason: "CAMPUS_SCOPE_DENIED",
          message: denialMessageForCampusAction(params.action, params.campusName),
          permissionKey,
        };
      }
    }
  }

  return evaluateLegacyCampusRole(
    params.campusRole,
    params.action,
    params.campusName,
  );
}

export async function getCampusCapabilities(params: {
  actorUserId: string;
  organizationId: string;
  campusId?: string | null;
  churchRole: MembershipRole | string;
  campusRole?: CampusRole | string | null;
  campusName?: string | null;
  admin?: SupabaseClient;
}): Promise<CampusCapabilities> {
  if (isTopLevelCampusAdminRole(params.churchRole)) {
    return capabilitiesFromTopLevelAdmin();
  }

  const actions: CampusAction[] = [
    "view",
    "overview.view",
    "create",
    "edit",
    "deactivate",
    "delete",
    "settings.manage",
    "security.manage",
    "members.view",
    "members.add",
    "members.remove",
    "members.manage",
    "roles.assign",
    "groups.manage",
    "audit.view",
  ];
  const results = {} as Record<CampusAction, CampusAuthResult>;
  await Promise.all(
    actions.map(async (action) => {
      results[action] = await canManageCampus({ ...params, action });
    }),
  );
  return capabilitiesFromResults(results, false);
}

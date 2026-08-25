import type { PermissionScopeType } from "@/lib/security/types";

export type CampusScopedGrant = {
  scope_type: PermissionScopeType | string | null | undefined;
  campus_id?: string | null;
};

/**
 * Member assignment campus scope is the smallest practical bound.
 * A North Campus assignment must not inherit all-campus group permissions.
 */
export function mergeGroupPermissionScope(params: {
  permissionScopeType: PermissionScopeType | string | null | undefined;
  permissionCampusId: string | null | undefined;
  membershipScopeType?: PermissionScopeType | string | null;
  membershipCampusId?: string | null;
}): { scope_type: PermissionScopeType; campus_id: string | null } {
  const membershipCampusId = params.membershipCampusId?.trim() || null;
  if (membershipCampusId) {
    return {
      scope_type: "selected_campuses",
      campus_id: membershipCampusId,
    };
  }

  const membershipScope = params.membershipScopeType?.trim() || null;
  const permissionScope =
    (params.permissionScopeType as PermissionScopeType | undefined) ??
    "all_current_future_campuses";

  return {
    scope_type: (membershipScope as PermissionScopeType) || permissionScope,
    campus_id: params.permissionCampusId ?? null,
  };
}

export function isCampusInScope(
  grant: CampusScopedGrant,
  campusId: string,
): boolean {
  if (grant.scope_type === "no_restriction") return true;
  if (grant.scope_type === "all_current_future_campuses") return true;
  if (grant.scope_type === "all_current_campuses") return true;
  if (grant.scope_type === "selected_campuses" && grant.campus_id === campusId) {
    return true;
  }
  return false;
}

/** Union grants from multiple groups/direct sources for one campus. */
export function unionPermissionsForCampus(
  grants: Array<{ permissionKey: string; campusId?: string | null; scopeType?: string | null }>,
  campusId: string,
): Set<string> {
  const keys = new Set<string>();
  for (const grant of grants) {
    if (
      isCampusInScope(
        { scope_type: grant.scopeType ?? "selected_campuses", campus_id: grant.campusId ?? null },
        campusId,
      )
    ) {
      keys.add(grant.permissionKey);
    }
  }
  return keys;
}

/**
 * Removing one group keeps keys still granted by another active group.
 */
export function remainingPermissionsAfterGroupRemoval(params: {
  removingGroupKeys: string[];
  otherGroupKeys: string[];
}): { willLose: string[]; willRetain: string[] } {
  const other = new Set(params.otherGroupKeys);
  const willLose: string[] = [];
  const willRetain: string[] = [];
  for (const key of params.removingGroupKeys) {
    if (other.has(key)) willRetain.push(key);
    else willLose.push(key);
  }
  return { willLose, willRetain };
}

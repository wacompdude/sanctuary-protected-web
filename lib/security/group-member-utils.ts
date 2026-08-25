import type { PermissionScopeType, SecurityGroupMemberStatus } from "./types";

export type ComputedAssignmentStatus =
  | "scheduled"
  | "active"
  | "expiring_soon"
  | "expired"
  | "revoked"
  | "cancelled";

export type GroupMemberAssignmentInput = {
  effectiveAt?: string | null;
  expiresAt?: string | null;
};

const EXPIRING_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export function validateAssignmentDates(input: GroupMemberAssignmentInput): string | null {
  if (!input.effectiveAt || !input.expiresAt) return null;
  const effective = new Date(input.effectiveAt);
  const expires = new Date(input.expiresAt);
  if (Number.isNaN(effective.getTime()) || Number.isNaN(expires.getTime())) {
    return "Invalid date format";
  }
  if (expires <= effective) {
    return "Expiration must be after the effective date";
  }
  return null;
}

export function computeAssignmentStatus(params: {
  status: SecurityGroupMemberStatus;
  effectiveAt: string | null;
  expiresAt: string | null;
  now?: Date;
  cancelled?: boolean;
}): ComputedAssignmentStatus {
  const now = params.now ?? new Date();

  if (params.status === "revoked") {
    return params.cancelled ? "cancelled" : "revoked";
  }

  if (params.status === "expired") {
    return "expired";
  }

  if (params.expiresAt) {
    const expires = new Date(params.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires < now) {
      return "expired";
    }
  }

  if (params.effectiveAt) {
    const effective = new Date(params.effectiveAt);
    if (!Number.isNaN(effective.getTime()) && effective > now) {
      return "scheduled";
    }
  }

  if (params.expiresAt) {
    const expires = new Date(params.expiresAt);
    if (
      !Number.isNaN(expires.getTime()) &&
      expires.getTime() - now.getTime() <= EXPIRING_SOON_MS
    ) {
      return "expiring_soon";
    }
  }

  return "active";
}

export function isAssignmentCurrentlyEffective(params: {
  status: SecurityGroupMemberStatus;
  effectiveAt: string | null;
  expiresAt: string | null;
  now?: Date;
}): boolean {
  if (params.status !== "active") return false;
  const computed = computeAssignmentStatus(params);
  return computed === "active" || computed === "expiring_soon";
}

export function labelForAssignmentStatus(status: ComputedAssignmentStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "active":
      return "Active";
    case "expiring_soon":
      return "Expiring soon";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function formatScopeLabel(
  scopeType: PermissionScopeType,
  campusName?: string | null,
): string {
  switch (scopeType) {
    case "all_current_future_campuses":
      return "All permitted campuses";
    case "all_current_campuses":
      return "All current campuses";
    case "selected_campuses":
      return campusName ? campusName : "Selected campus";
    case "primary_campus":
      return "Member primary campus";
    case "no_restriction":
      return "No campus restriction";
    default:
      return scopeType;
  }
}

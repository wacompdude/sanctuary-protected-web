import { formatChurchDate } from "@/lib/datetime/format";
import type { MembershipRole, MembershipStatus } from "@/lib/church/types";
import { isOwnershipRole, normalizeMembershipRole } from "@/lib/church/types";

export type ManageableRole = Exclude<MembershipRole, "owner">;

export type TeamMemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string | null;
  updatedAt: string | null;
  isLastActiveOwner: boolean;
  avatarUrl: string | null;
};

export function canManageTeamMemberships(role: MembershipRole): boolean {
  return (
    isOwnershipRole(role) ||
    role === "administrator" ||
    role === "security_leader"
  );
}

/** Roles the actor may assign when changing another member's role. */
export function rolesActorMayAssign(actorRole: MembershipRole): ManageableRole[] {
  if (isOwnershipRole(actorRole)) {
    return [
      "co_owner",
      "administrator",
      "security_leader",
      "security_member",
      "viewer",
    ];
  }
  if (actorRole === "administrator") {
    // Admins may manage peer admins and lower roles; never ownership tier.
    return [
      "administrator",
      "security_leader",
      "security_member",
      "viewer",
    ];
  }
  if (actorRole === "security_leader") {
    return ["security_member", "viewer"];
  }
  return [];
}

/** Target membership roles this actor is allowed to manage. */
export function rolesActorMayManage(actorRole: MembershipRole): MembershipRole[] {
  if (isOwnershipRole(actorRole)) {
    return [
      "co_owner",
      "administrator",
      "security_leader",
      "security_member",
      "viewer",
    ];
  }
  if (actorRole === "administrator") {
    return [
      "administrator",
      "security_leader",
      "security_member",
      "viewer",
    ];
  }
  if (actorRole === "security_leader") {
    return ["security_member", "viewer"];
  }
  return [];
}

export function canActorManageTarget(params: {
  actorRole: MembershipRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: MembershipRole;
  targetStatus: MembershipStatus;
}): boolean {
  const {
    actorRole,
    actorUserId,
    targetUserId,
    targetRole,
    targetStatus,
  } = params;

  if (!canManageTeamMemberships(actorRole)) return false;
  if (actorUserId === targetUserId) return false;
  // Primary owner role changes go through ownership transfer, not team role edit.
  if (targetRole === "owner") return false;
  if (targetStatus === "removed" && actorRole === "security_leader") {
    return false;
  }
  return rolesActorMayManage(actorRole).includes(targetRole);
}

export function canChangeRole(params: {
  actorRole: MembershipRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: MembershipRole;
  targetStatus: MembershipStatus;
  nextRole: MembershipRole;
}): boolean {
  if (
    !canActorManageTarget({
      actorRole: params.actorRole,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId,
      targetRole: params.targetRole,
      targetStatus: params.targetStatus,
    })
  ) {
    return false;
  }
  if (params.targetStatus !== "active" && params.targetStatus !== "suspended") {
    return false;
  }
  if (params.nextRole === "owner") return false;
  return rolesActorMayAssign(params.actorRole).includes(
    params.nextRole as ManageableRole,
  );
}

export function canChangeStatus(params: {
  actorRole: MembershipRole;
  actorUserId: string;
  targetUserId: string;
  targetRole: MembershipRole;
  targetStatus: MembershipStatus;
  nextStatus: MembershipStatus;
  isLastActiveOwner: boolean;
}): boolean {
  if (
    !canActorManageTarget({
      actorRole: params.actorRole,
      actorUserId: params.actorUserId,
      targetUserId: params.targetUserId,
      targetRole: params.targetRole,
      targetStatus: params.targetStatus,
    })
  ) {
    return false;
  }

  if (params.nextStatus === params.targetStatus) return false;

  const { targetStatus, nextStatus, targetRole, isLastActiveOwner } = params;

  if (targetRole === "owner" && isLastActiveOwner) {
    if (nextStatus === "suspended" || nextStatus === "removed") return false;
  }

  if (targetStatus === "active") {
    return nextStatus === "suspended" || nextStatus === "removed";
  }
  if (targetStatus === "suspended") {
    return nextStatus === "active" || nextStatus === "removed";
  }
  if (targetStatus === "removed") {
    return (
      nextStatus === "active" &&
      (isOwnershipRole(params.actorRole) || params.actorRole === "administrator")
    );
  }
  return false;
}

export function labelForMembershipStatus(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "suspended":
      return "Suspended";
    case "removed":
      return "Removed";
    case "invited":
      return "Invited";
    default:
      return status;
  }
}

export function formatTeamDate(
  value: string | null | undefined,
  timeZone?: string | null,
): string {
  if (!value) return "—";
  return formatChurchDate(value, { timeZone });
}

export function displayMemberName(profile: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null): string {
  if (!profile) return "Member";
  return (
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    "Member"
  );
}

export function parseMembershipStatus(
  value: string | null | undefined,
): MembershipStatus {
  switch (value) {
    case "invited":
    case "active":
    case "suspended":
    case "removed":
      return value;
    default:
      return "active";
  }
}

export function parseMembershipRoleSafe(
  value: string | null | undefined,
): MembershipRole {
  return normalizeMembershipRole(value);
}

"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  canChangeRole,
  canChangeStatus,
  parseMembershipRoleSafe,
  parseMembershipStatus,
} from "@/lib/church/team";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

async function loadTargetMembership(
  supabase: Awaited<
    ReturnType<typeof getOperationalChurchContext>
  >["supabase"],
  churchId: string,
  membershipId: string,
) {
  const { data, error } = await supabase
    .from("church_memberships")
    .select("id, church_id, user_id, role, status")
    .eq("id", membershipId)
    .eq("church_id", churchId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id as string,
    church_id: data.church_id as string,
    user_id: data.user_id as string,
    role: parseMembershipRoleSafe(data.role as string),
    status: parseMembershipStatus(data.status as string),
  };
}

async function countActiveOwners(
  supabase: Awaited<
    ReturnType<typeof getOperationalChurchContext>
  >["supabase"],
  churchId: string,
): Promise<number> {
  const { count } = await supabase
    .from("church_memberships")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("role", "owner")
    .eq("status", "active");
  return count ?? 0;
}

export async function updateTeamMemberRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const nextRoleRaw = String(formData.get("role") ?? "").trim();

  if (!membershipId || !nextRoleRaw) {
    return { error: "Missing membership or role." };
  }

  const nextRole = parseMembershipRoleSafe(nextRoleRaw);
  if (nextRole === "owner") {
    return {
      error:
        "Use Ownership settings to transfer the primary owner role to a co-owner.",
    };
  }

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    const target = await loadTargetMembership(
      supabase,
      church.id,
      membershipId,
    );
    if (!target) {
      return { error: "Member not found." };
    }

    if (
      !canChangeRole({
        actorRole: membership.role,
        actorUserId: user.id,
        targetUserId: target.user_id,
        targetRole: target.role,
        targetStatus: target.status,
        nextRole,
      })
    ) {
      return { error: "You do not have permission to change this member's role." };
    }

    if (target.role === nextRole) {
      return { success: true };
    }
    const { error: updateError } = await supabase
      .from("church_memberships")
      .update({
        role: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("church_id", church.id);

    if (updateError) {
      return { error: updateError.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.MEMBERSHIP_ROLE_CHANGED,
      entityType: AuditEntityType.CHURCH_MEMBERSHIP,
      entityId: target.id,
      metadata: {
        target_user_id: target.user_id,
        from_role: target.role,
        to_role: nextRole,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to update member role.",
    };
  }
}

export async function updateTeamMemberStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const nextStatusRaw = String(formData.get("status") ?? "").trim();
  const confirmed = String(formData.get("confirmed") ?? "") === "1";

  if (!membershipId || !nextStatusRaw) {
    return { error: "Missing membership or status." };
  }

  const nextStatus = parseMembershipStatus(nextStatusRaw);
  if (nextStatus === "suspended" || nextStatus === "removed") {
    if (!confirmed) {
      return { error: "Confirmation is required for this action." };
    }
  }

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    const target = await loadTargetMembership(
      supabase,
      church.id,
      membershipId,
    );
    if (!target) {
      return { error: "Member not found." };
    }

    const activeOwners = await countActiveOwners(supabase, church.id);
    const isLastActiveOwner =
      target.role === "owner" &&
      target.status === "active" &&
      activeOwners <= 1;

    if (
      !canChangeStatus({
        actorRole: membership.role,
        actorUserId: user.id,
        targetUserId: target.user_id,
        targetRole: target.role,
        targetStatus: target.status,
        nextStatus,
        isLastActiveOwner,
      })
    ) {
      if (isLastActiveOwner && (nextStatus === "suspended" || nextStatus === "removed")) {
        return { error: "Cannot suspend or remove the last active owner." };
      }
      return {
        error: "You do not have permission to change this member's status.",
      };
    }

    if (nextStatus === "active" && target.status !== "active") {
      const { requireActiveSeatCapacity } = await import(
        "@/lib/subscriptions/enforcement"
      );
      await requireActiveSeatCapacity({ churchId: church.id });
    }

    const { error: updateError } = await supabase
      .from("church_memberships")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("church_id", church.id);

    if (updateError) {
      return { error: updateError.message };
    }

    const statusAction =
      nextStatus === "suspended"
        ? AuditAction.MEMBERSHIP_SUSPENDED
        : nextStatus === "removed"
          ? AuditAction.MEMBERSHIP_REMOVED
          : AuditAction.MEMBERSHIP_REACTIVATED;

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: statusAction,
      entityType: AuditEntityType.CHURCH_MEMBERSHIP,
      entityId: target.id,
      metadata: {
        target_user_id: target.user_id,
        from_status: target.status,
        to_status: nextStatus,
        role: target.role,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update member status.",
    };
  }
}

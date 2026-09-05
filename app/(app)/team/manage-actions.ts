"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/organization/auth";
import type { ActionState } from "@/lib/organization/types";
import {
  canChangeRole,
  canChangeStatus,
  canEditMemberProfile,
  parseMembershipRoleSafe,
  parseMembershipStatus,
} from "@/lib/organization/team";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import type { ProfileActionState } from "@/lib/profile/types";

async function loadTargetMembership(
  supabase: Awaited<
    ReturnType<typeof getOperationalChurchContext>
  >["supabase"],
  organizationId: string,
  membershipId: string,
) {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, status")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id as string,
    organization_id: data.organization_id as string,
    user_id: data.user_id as string,
    role: parseMembershipRoleSafe(data.role as string),
    status: parseMembershipStatus(data.status as string),
  };
}

async function countActiveOwners(
  supabase: Awaited<
    ReturnType<typeof getOperationalChurchContext>
  >["supabase"],
  organizationId: string,
): Promise<number> {
  const { count } = await supabase
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
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
      .from("organization_memberships")
      .update({
        role: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("organization_id", church.id);

    if (updateError) {
      return { error: updateError.message };
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
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
      await requireActiveSeatCapacity({ organizationId: church.id });
    }

    const { error: updateError } = await supabase
      .from("organization_memberships")
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .eq("organization_id", church.id);

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
      organizationId: church.id,
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

function optionalText(value: FormDataEntryValue | null, max = 100): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function updateMemberProfile(
  _prev: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const userId = String(formData.get("user_id") ?? "").trim();
  const firstName = optionalText(formData.get("first_name"));
  const lastName = optionalText(formData.get("last_name"));
  const phone = optionalText(formData.get("phone"), 40);

  if (!userId) {
    return { error: "Missing member." };
  }

  const fieldErrors: ProfileActionState["fieldErrors"] = {};
  if (formData.get("first_name") && !firstName) {
    fieldErrors.first_name = "First name cannot be only spaces.";
  }
  if (formData.get("last_name") && !lastName) {
    fieldErrors.last_name = "Last name cannot be only spaces.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canEditMemberProfile(membership.role)) {
      return {
        error:
          "Only owners, co-owners, and administrators can update a member's name.",
      };
    }

    const { data: target } = await supabase
      .from("organization_memberships")
      .select("id, user_id")
      .eq("organization_id", church.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!target) {
      return { error: "Member not found." };
    }

    const { error: updateError } = await supabase.rpc("update_member_profile", {
      p_user_id: userId,
      p_first_name: firstName ?? "",
      p_last_name: lastName ?? "",
      p_phone: phone ?? "",
    });

    if (updateError) {
      const message = updateError.message || "Unable to update this member.";
      if (message.includes("FORBIDDEN")) {
        return {
          error:
            "Only owners, co-owners, and administrators can update a member's name.",
        };
      }
      if (
        /function\s+[\w.]+\s*\([^)]*\)\s+does not exist/i.test(message) ||
        message.includes("update_member_profile")
      ) {
        return {
          error:
            "Member profile editing is not configured yet. Run supabase/migrations/096_update_member_profile.sql in the Supabase SQL Editor.",
        };
      }
      return { error: message };
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.MEMBER_PROFILE_UPDATED,
      entityType: AuditEntityType.USER,
      entityId: userId,
      metadata: {
        target_user_id: userId,
        first_name: firstName,
        last_name: lastName,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/team");
    revalidatePath("/settings/security");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update this member.",
    };
  }
}

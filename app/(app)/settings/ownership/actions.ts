"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";
import {
  auditOwnershipTransferCompleted,
  auditOwnershipTransferInitiated,
} from "@/lib/audit/church-events";

export async function transferOwnershipToCoOwnerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membershipId = String(formData.get("membership_id") ?? "").trim();
  const confirmed = String(formData.get("confirmed") ?? "") === "1";
  const confirmName = String(formData.get("confirm_name") ?? "").trim();

  if (!membershipId) {
    return { error: "Select a co-owner to receive ownership." };
  }
  if (!confirmed) {
    return { error: "Confirmation is required to transfer ownership." };
  }

  try {
    const { supabase, user, church, membership } =
      await getAuthenticatedUserWithChurch();

    if (membership.role !== "owner") {
      return {
        error: "Only the current primary owner can transfer ownership.",
      };
    }

    if (confirmName !== church.name) {
      return {
        fieldErrors: {
          confirm_name: "Type the exact church name to confirm.",
        },
      };
    }

    const { data: target, error: targetError } = await supabase
      .from("church_memberships")
      .select("id, user_id, role, status")
      .eq("id", membershipId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (targetError || !target) {
      return { error: "Selected member was not found." };
    }

    if (target.user_id === user.id) {
      return { error: "You already own this church." };
    }

    if (target.status !== "active" || target.role !== "co_owner") {
      return {
        error: "Ownership can only be transferred to an active co-owner.",
      };
    }

    await auditOwnershipTransferInitiated(supabase, {
      churchId: church.id,
      userId: user.id,
      fromUserId: user.id,
      toUserId: target.user_id as string,
    });

    const { data, error } = await supabase.rpc("transfer_church_ownership", {
      p_church_id: church.id,
      p_to_membership_id: membershipId,
    });

    if (error) {
      return { error: error.message };
    }

    const result = (data ?? {}) as Record<string, unknown>;
    await auditOwnershipTransferCompleted(supabase, {
      churchId: church.id,
      userId: user.id,
      fromUserId: user.id,
      toUserId: String(result.to_user_id ?? target.user_id),
    });

    revalidatePath("/settings/ownership");
    revalidatePath("/team");
    revalidatePath("/settings/church");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to transfer ownership.",
    };
  }
}

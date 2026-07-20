"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { createClient } from "@/lib/supabase/server";
import { validateUnavailabilityForm } from "@/lib/schedule/availability-validation";
import {
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import {
  canManageSchedule,
  canViewTeamUnavailability,
} from "@/lib/schedule/permissions";
import { getChurchScheduleSettings } from "@/lib/schedule/shift-queries";
import type { ScheduleActionState } from "@/lib/schedule/types";

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

function revalidateAvailabilityPaths() {
  revalidatePath("/schedule/availability");
  revalidatePath("/schedule/my-schedule");
  revalidatePath("/schedule/calendar");
  revalidatePath("/schedule/shifts");
}

export async function createUnavailabilityAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    const settings = await getChurchScheduleSettings(church.id);
    const canManage = canManageSchedule(membership.role);
    const membersMayCreate =
      (settings as { members_may_create_unavailability?: boolean } | null)
        ?.members_may_create_unavailability !== false;

    if (!canManage && !membersMayCreate) {
      return {
        error: "Creating unavailability is disabled for members.",
      };
    }

    const validated = validateUnavailabilityForm(
      formData,
      church.timezone ?? "America/Los_Angeles",
    );
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid form data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    let targetMembershipId = membership.id;
    let targetUserId = user.id;

    if (validated.data.membership_id) {
      if (!canManage) {
        return {
          error: "Only schedule managers can add unavailability for others.",
        };
      }
      const supabaseCheck = await createClient();
      const { data: target } = await supabaseCheck
        .from("church_memberships")
        .select("id, user_id, status")
        .eq("id", validated.data.membership_id)
        .eq("church_id", church.id)
        .maybeSingle();
      if (!target || target.status !== "active") {
        return { error: "Selected member was not found or is not active." };
      }
      targetMembershipId = target.id;
      targetUserId = target.user_id;
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("member_unavailability")
      .insert({
        church_id: church.id,
        membership_id: targetMembershipId,
        user_id: targetUserId,
        title: validated.data.title,
        reason_category: validated.data.reason_category,
        notes: validated.data.notes,
        start_at: validated.data.start_at,
        end_at: validated.data.end_at,
        all_day: validated.data.all_day,
        timezone: validated.data.timezone,
        recurrence_rule: validated.data.recurrence_rule,
        recurrence_end_at: validated.data.recurrence_end_at,
        status: "active",
        created_by: user.id,
        approved_by: canManage && targetUserId !== user.id ? user.id : null,
      })
      .select("id")
      .single();

    if (error) {
      const hint = scheduleMigrationHintFromError(error.message);
      return { error: hint ?? "Unable to save unavailability." };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_UNAVAILABILITY_CREATED,
      entityType: AuditEntityType.MEMBER_UNAVAILABILITY,
      entityId: data.id,
      metadata: {
        membership_id: targetMembershipId,
        reason_category: validated.data.reason_category,
        start_at: validated.data.start_at,
        end_at: validated.data.end_at,
        // Do not log private notes
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAvailabilityPaths();
    redirect("/schedule/availability");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to save unavailability." };
  }
}

export async function updateUnavailabilityAction(
  unavailabilityId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    const settings = await getChurchScheduleSettings(church.id);
    const canManage = canManageSchedule(membership.role);
    const membersMayEdit =
      (settings as { members_may_edit_future_unavailability?: boolean } | null)
        ?.members_may_edit_future_unavailability !== false;

    const supabase = await createClient();
    const { data: existing, error: loadError } = await supabase
      .from("member_unavailability")
      .select("id, user_id, status, end_at")
      .eq("id", unavailabilityId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError) {
      const hint = scheduleMigrationHintFromError(loadError.message);
      return { error: hint ?? SCHEDULE_MIGRATION_HINT };
    }
    if (!existing) return { error: "Unavailability not found." };
    if (existing.status === "cancelled") {
      return { error: "Cancelled unavailability cannot be edited." };
    }

    const isOwner = existing.user_id === user.id;
    if (!isOwner && !canManage) {
      return { error: "You can only edit your own unavailability." };
    }
    if (isOwner && !canManage && !membersMayEdit) {
      return { error: "Editing unavailability is disabled for members." };
    }
    if (
      isOwner &&
      !canManage &&
      new Date(existing.end_at as string).getTime() < Date.now()
    ) {
      return { error: "Past unavailability cannot be edited." };
    }

    const validated = validateUnavailabilityForm(
      formData,
      church.timezone ?? "America/Los_Angeles",
    );
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid form data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const { error } = await supabase
      .from("member_unavailability")
      .update({
        title: validated.data.title,
        reason_category: validated.data.reason_category,
        notes: validated.data.notes,
        start_at: validated.data.start_at,
        end_at: validated.data.end_at,
        all_day: validated.data.all_day,
        timezone: validated.data.timezone,
        recurrence_rule: validated.data.recurrence_rule,
        recurrence_end_at: validated.data.recurrence_end_at,
      })
      .eq("id", unavailabilityId)
      .eq("church_id", church.id);

    if (error) return { error: "Unable to update unavailability." };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_UNAVAILABILITY_UPDATED,
      entityType: AuditEntityType.MEMBER_UNAVAILABILITY,
      entityId: unavailabilityId,
      metadata: {
        reason_category: validated.data.reason_category,
        start_at: validated.data.start_at,
        end_at: validated.data.end_at,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAvailabilityPaths();
    redirect("/schedule/availability");
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to update unavailability." };
  }
}

export async function cancelUnavailabilityAction(
  unavailabilityId: string,
): Promise<ScheduleActionState> {
  try {
    const { user, church, membership } = await getAuthenticatedUserWithChurch();
    const canManage = canManageSchedule(membership.role);
    const supabase = await createClient();

    const { data: existing, error: loadError } = await supabase
      .from("member_unavailability")
      .select("id, user_id, status, start_at")
      .eq("id", unavailabilityId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError) {
      const hint = scheduleMigrationHintFromError(loadError.message);
      return { error: hint ?? "Unable to cancel unavailability." };
    }
    if (!existing) return { error: "Unavailability not found." };

    const isOwner = existing.user_id === user.id;
    if (!isOwner && !canManage) {
      return { error: "You can only cancel your own unavailability." };
    }
    if (
      isOwner &&
      !canManage &&
      new Date(existing.start_at as string).getTime() < Date.now()
    ) {
      return {
        error: "Only future unavailability can be cancelled by members.",
      };
    }

    const { error } = await supabase
      .from("member_unavailability")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", unavailabilityId)
      .eq("church_id", church.id);

    if (error) return { error: "Unable to cancel unavailability." };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_UNAVAILABILITY_CANCELLED,
      entityType: AuditEntityType.MEMBER_UNAVAILABILITY,
      entityId: unavailabilityId,
      metadata: {},
      ipAddress: await getRequestIpAddress(),
    });

    revalidateAvailabilityPaths();
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to cancel unavailability." };
  }
}

/** Guard helper for pages that need team view. */
export async function assertCanViewTeamAvailability() {
  const ctx = await getAuthenticatedUserWithChurch();
  if (!canViewTeamUnavailability(ctx.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to view team availability.",
    );
  }
  return ctx;
}

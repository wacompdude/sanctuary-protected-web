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
import {
  hasBlockingConflicts,
  validateShiftAssignment,
} from "@/lib/schedule/conflicts";
import {
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import { canManageSchedule } from "@/lib/schedule/permissions";
import {
  notifyAssignmentCancelled,
  notifyAssignmentCreated,
  notifyAssignmentResponse,
  notifyShiftCancelled,
} from "@/lib/schedule/notify";
import {
  getChurchScheduleSettings,
  getScheduleShiftById,
} from "@/lib/schedule/shift-queries";
import {
  validateAssignMemberForm,
  validateAssignmentResponseForm,
  validateScheduleShiftForm,
} from "@/lib/schedule/shift-validation";
import type { ScheduleActionState, ScheduleShift } from "@/lib/schedule/types";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

function isNextRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"),
  );
}

async function requireScheduleManager() {
  const ctx = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(ctx.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to manage schedule shifts.",
    );
  }
  await requireFeature({
    churchId: ctx.church.id,
    featureKey: FEATURE_KEYS.TEAM_SCHEDULING,
  });
  return ctx;
}

function revalidateShiftPaths(shiftId?: string) {
  revalidatePath("/schedule");
  revalidatePath("/schedule/calendar");
  revalidatePath("/schedule/shifts");
  revalidatePath("/schedule/my-schedule");
  if (shiftId) revalidatePath(`/schedule/shifts/${shiftId}`);
}

export async function createScheduleShiftAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const validated = validateScheduleShiftForm(
      formData,
      church.timezone ?? "America/Los_Angeles",
    );
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid form data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schedule_shifts")
      .insert({
        church_id: church.id,
        ...validated.data,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.message.includes("SCHEDULE_SHIFT_OUTSIDE_EVENT_WINDOW")) {
        return {
          error:
            "Shift times must fall within the related event window, or enable “Allow outside event window”.",
        };
      }
      const hint = scheduleMigrationHintFromError(error.message);
      return { error: hint ?? "Unable to create the shift." };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_SHIFT_CREATED,
      entityType: AuditEntityType.SCHEDULE_SHIFT,
      entityId: data.id,
      metadata: {
        title: validated.data.title,
        event_id: validated.data.event_id,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateShiftPaths(data.id);
    redirect(`/schedule/shifts/${data.id}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to create the shift." };
  }
}

export async function updateScheduleShiftAction(
  shiftId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const validated = validateScheduleShiftForm(
      formData,
      church.timezone ?? "America/Los_Angeles",
    );
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid form data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    const existing = await getScheduleShiftById(shiftId, church.id);
    if (!existing) return { error: "Shift not found." };
    if (existing.status === "cancelled") {
      return { error: "Cancelled shifts cannot be edited." };
    }

    const { error } = await supabase
      .from("schedule_shifts")
      .update({
        ...validated.data,
        updated_by: user.id,
      })
      .eq("id", shiftId)
      .eq("church_id", church.id);

    if (error) {
      if (error.message.includes("SCHEDULE_SHIFT_OUTSIDE_EVENT_WINDOW")) {
        return {
          error:
            "Shift times must fall within the related event window, or enable “Allow outside event window”.",
        };
      }
      return { error: "Unable to update the shift." };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_SHIFT_UPDATED,
      entityType: AuditEntityType.SCHEDULE_SHIFT,
      entityId: shiftId,
      metadata: { title: validated.data.title },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateShiftPaths(shiftId);
    redirect(`/schedule/shifts/${shiftId}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to update the shift." };
  }
}

export async function cancelScheduleShiftAction(
  shiftId: string,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const supabase = await createClient();
    const existing = await getScheduleShiftById(shiftId, church.id);
    if (!existing) return { error: "Shift not found." };

    const { data: assignees } = await supabase
      .from("shift_assignments")
      .select("user_id")
      .eq("church_id", church.id)
      .eq("shift_id", shiftId)
      .not("status", "in", '("declined","cancelled")');

    const { error } = await supabase
      .from("schedule_shifts")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", shiftId)
      .eq("church_id", church.id);

    if (error) return { error: "Unable to cancel the shift." };

    await supabase
      .from("shift_assignments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("church_id", church.id)
      .eq("shift_id", shiftId)
      .not("status", "in", '("declined","cancelled","completed")');

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_SHIFT_CANCELLED,
      entityType: AuditEntityType.SCHEDULE_SHIFT,
      entityId: shiftId,
      metadata: { title: existing.title },
      ipAddress: await getRequestIpAddress(),
    });

    const recipientUserIds = [
      ...new Set(
        (assignees ?? [])
          .map((row) => row.user_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    await notifyShiftCancelled({
      churchId: church.id,
      createdBy: user.id,
      timeZone: church.timezone,
      shift: existing,
      recipientUserIds,
    });

    revalidateShiftPaths(shiftId);
    return { success: true, shiftId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to cancel the shift." };
  }
}

export async function assignMemberToShiftAction(
  shiftId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church, membership } = await requireScheduleManager();
    const validated = validateAssignMemberForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid form data.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    const shift = await getScheduleShiftById(shiftId, church.id);
    if (!shift) return { error: "Shift not found." };
    if (shift.status === "cancelled") {
      return { error: "Cannot assign members to a cancelled shift." };
    }

    const { data: targetMembership, error: membershipError } = await supabase
      .from("church_memberships")
      .select("id, user_id, status, church_id")
      .eq("id", validated.data.membership_id)
      .eq("church_id", church.id)
      .maybeSingle();

    if (membershipError || !targetMembership) {
      return { error: "Selected member was not found in this church." };
    }

    const settings = await getChurchScheduleSettings(church.id);
    const conflicts = await validateShiftAssignment(supabase, {
      churchId: church.id,
      shift: shift as ScheduleShift,
      membershipId: targetMembership.id,
      userId: targetMembership.user_id,
      membershipStatus: targetMembership.status,
      allowOverride: validated.data.conflict_override,
      settings: settings as {
        prevent_assignment_during_unavailability?: boolean;
        allow_conflict_override?: boolean;
        enforce_certification_requirements?: boolean;
      } | null,
    });

    if (hasBlockingConflicts(conflicts) && !validated.data.conflict_override) {
      return {
        error: "Resolve or override conflicts before assigning.",
        conflicts,
      };
    }

    if (
      hasBlockingConflicts(conflicts) &&
      validated.data.conflict_override &&
      !canManageSchedule(membership.role)
    ) {
      return { error: "You cannot override scheduling conflicts." };
    }

    const blockingStill =
      hasBlockingConflicts(conflicts) &&
      conflicts.some((c) => c.severity === "blocker" && !c.override_allowed);
    if (blockingStill) {
      return {
        error: "One or more conflicts cannot be overridden.",
        conflicts,
      };
    }

    const { data: assignment, error } = await supabase
      .from("shift_assignments")
      .insert({
        church_id: church.id,
        shift_id: shiftId,
        membership_id: targetMembership.id,
        user_id: targetMembership.user_id,
        assignment_role: validated.data.assignment_role,
        status: "invited",
        assigned_by: user.id,
        notes: validated.data.notes,
        conflict_override: validated.data.conflict_override,
        conflict_override_reason: validated.data.conflict_override
          ? validated.data.conflict_override_reason
          : null,
        conflict_overridden_by: validated.data.conflict_override
          ? user.id
          : null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "This member is already assigned to the shift." };
      }
      const hint = scheduleMigrationHintFromError(error.message);
      return { error: hint ?? "Unable to create the assignment." };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: validated.data.conflict_override
        ? AuditAction.SCHEDULE_ASSIGNMENT_OVERRIDE
        : AuditAction.SCHEDULE_ASSIGNMENT_CREATED,
      entityType: AuditEntityType.SHIFT_ASSIGNMENT,
      entityId: assignment.id,
      metadata: {
        shift_id: shiftId,
        membership_id: targetMembership.id,
        conflict_override: validated.data.conflict_override,
        conflict_types: conflicts.map((c) => c.conflict_type),
      },
      ipAddress: await getRequestIpAddress(),
    });

    const inviteEmailEnabled =
      (settings as { assignment_invitation_email_enabled?: boolean } | null)
        ?.assignment_invitation_email_enabled !== false;
    if (inviteEmailEnabled) {
      await notifyAssignmentCreated({
        churchId: church.id,
        createdBy: user.id,
        timeZone: church.timezone,
        shift,
        assignmentId: assignment.id,
        recipientUserId: targetMembership.user_id,
        assignmentRole: validated.data.assignment_role,
        eventTitle: shift.event_title,
        campusName: shift.campus_name,
        conflictOverride: validated.data.conflict_override,
        customMessage: validated.data.notes,
      });
    }

    revalidateShiftPaths(shiftId);
    return { success: true, shiftId, assignmentId: assignment.id, conflicts };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to assign the member." };
  }
}

export async function cancelShiftAssignmentAction(
  assignmentId: string,
  shiftId: string,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("shift_assignments")
      .select("id, user_id, status")
      .eq("id", assignmentId)
      .eq("church_id", church.id)
      .eq("shift_id", shiftId)
      .maybeSingle();

    const { error } = await supabase
      .from("shift_assignments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", assignmentId)
      .eq("church_id", church.id)
      .eq("shift_id", shiftId);

    if (error) return { error: "Unable to cancel the assignment." };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_ASSIGNMENT_CANCELLED,
      entityType: AuditEntityType.SHIFT_ASSIGNMENT,
      entityId: assignmentId,
      metadata: { shift_id: shiftId },
      ipAddress: await getRequestIpAddress(),
    });

    const shift = await getScheduleShiftById(shiftId, church.id);
    if (shift && existing?.user_id) {
      await notifyAssignmentCancelled({
        churchId: church.id,
        createdBy: user.id,
        timeZone: church.timezone,
        shift,
        assignmentId,
        recipientUserId: existing.user_id,
      });
    }

    revalidateShiftPaths(shiftId);
    return { success: true, shiftId, assignmentId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to cancel the assignment." };
  }
}

export async function respondToAssignmentAction(
  assignmentId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await getAuthenticatedUserWithChurch();
    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.TEAM_SCHEDULING,
    });
    const validated = validateAssignmentResponseForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid response.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data: assignment, error: loadError } = await supabase
      .from("shift_assignments")
      .select("id, shift_id, user_id, status")
      .eq("id", assignmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (loadError) {
      const hint = scheduleMigrationHintFromError(loadError.message);
      return { error: hint ?? SCHEDULE_MIGRATION_HINT };
    }
    if (!assignment || assignment.user_id !== user.id) {
      return { error: "Assignment not found." };
    }
    if (
      assignment.status !== "invited" &&
      assignment.status !== "pending"
    ) {
      return { error: "This assignment can no longer be accepted or declined." };
    }

    const settings = await getChurchScheduleSettings(church.id);
    const requireConfirm =
      (settings as { require_assignment_confirmation?: boolean } | null)
        ?.require_assignment_confirmation !== false;

    const nextStatus =
      validated.data.decision === "accept"
        ? requireConfirm
          ? "confirmed"
          : "accepted"
        : "declined";

    const { error } = await supabase
      .from("shift_assignments")
      .update({
        status: nextStatus,
        responded_at: new Date().toISOString(),
        confirmed_at:
          nextStatus === "confirmed" ? new Date().toISOString() : null,
        declined_at:
          nextStatus === "declined" ? new Date().toISOString() : null,
        decline_note:
          nextStatus === "declined" ? validated.data.decline_note : null,
      })
      .eq("id", assignmentId)
      .eq("church_id", church.id)
      .eq("user_id", user.id);

    if (error) return { error: "Unable to save your response." };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action:
        validated.data.decision === "accept"
          ? AuditAction.SCHEDULE_ASSIGNMENT_ACCEPTED
          : AuditAction.SCHEDULE_ASSIGNMENT_DECLINED,
      entityType: AuditEntityType.SHIFT_ASSIGNMENT,
      entityId: assignmentId,
      metadata: { shift_id: assignment.shift_id, status: nextStatus },
      ipAddress: await getRequestIpAddress(),
    });

    const shift = await getScheduleShiftById(assignment.shift_id, church.id);
    const { data: managers } = await supabase
      .from("church_memberships")
      .select("user_id")
      .eq("church_id", church.id)
      .eq("status", "active")
      .in("role", ["owner", "co_owner", "administrator", "security_leader"]);

    const profile = await supabase
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();
    const memberName =
      profile.data?.full_name?.trim() ||
      [profile.data?.first_name, profile.data?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "A team member";

    await notifyAssignmentResponse({
      churchId: church.id,
      createdBy: user.id,
      timeZone: church.timezone,
      shiftId: assignment.shift_id,
      shiftTitle: shift?.title ?? "Shift",
      assignmentId,
      decision: validated.data.decision,
      memberName,
      schedulerUserIds: [
        ...new Set(
          (managers ?? [])
            .map((row) => row.user_id as string)
            .filter((id) => id && id !== user.id),
        ),
      ],
    });

    revalidateShiftPaths(assignment.shift_id);
    return {
      success: true,
      assignmentId,
      shiftId: assignment.shift_id,
    };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return { error: "Unable to save your response." };
  }
}

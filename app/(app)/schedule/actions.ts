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
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { notifyEventCancelled } from "@/lib/schedule/notify";
import type { ScheduleActionState } from "@/lib/schedule/types";
import { validateScheduleEventForm } from "@/lib/schedule/validation";
import { entitlementErrorMessage } from "@/lib/subscriptions/enforcement";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

async function requireScheduleManager() {
  const ctx = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(ctx.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to manage the schedule.",
    );
  }
  await requireFeature({
    churchId: ctx.church.id,
    featureKey: FEATURE_KEYS.TEAM_SCHEDULING,
  });
  return ctx;
}

async function writeScheduleChangeHistory(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  churchId: string;
  entityId: string;
  eventId: string;
  action: string;
  summary: string;
  actorUserId: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  changedFields?: string[];
}) {
  await input.supabase.from("schedule_change_history").insert({
    church_id: input.churchId,
    entity_type: "event",
    entity_id: input.entityId,
    event_id: input.eventId,
    action: input.action,
    summary: input.summary,
    changed_fields: input.changedFields ?? [],
    previous_values: input.previousValues ?? null,
    new_values: input.newValues ?? null,
    actor_user_id: input.actorUserId,
  });
}

export async function createScheduleEventAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const validated = validateScheduleEventForm(
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
    const payload = {
      church_id: church.id,
      ...validated.data,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("schedule_events")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      const hint = scheduleMigrationHintFromError(error.message);
      return { error: hint ?? "Unable to create the event. Please try again." };
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_EVENT_CREATED,
      entityType: AuditEntityType.SCHEDULE_EVENT,
      entityId: data.id,
      metadata: {
        title: validated.data.title,
        event_type: validated.data.event_type,
        status: validated.data.status,
      },
      ipAddress,
    });

    await writeScheduleChangeHistory({
      supabase,
      churchId: church.id,
      entityId: data.id,
      eventId: data.id,
      action: "schedule.event_created",
      summary: `Created event “${validated.data.title}”`,
      actorUserId: user.id,
      newValues: {
        title: validated.data.title,
        status: validated.data.status,
        start_at: validated.data.start_at,
        end_at: validated.data.end_at,
      },
    });

    revalidatePath("/schedule");
    revalidatePath("/schedule/calendar");
    revalidatePath("/schedule/events");
    redirect(`/schedule/events/${data.id}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    const entitlementMessage = entitlementErrorMessage(error);
    if (entitlementMessage) return { error: entitlementMessage };
    return { error: "Unable to create the event. Please try again." };
  }
}

export async function updateScheduleEventAction(
  eventId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const validated = validateScheduleEventForm(
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
    const { data: existing, error: existingError } = await supabase
      .from("schedule_events")
      .select("id, title, status, start_at, end_at")
      .eq("id", eventId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (existingError) {
      const hint = scheduleMigrationHintFromError(existingError.message);
      return { error: hint ?? SCHEDULE_MIGRATION_HINT };
    }
    if (!existing) {
      return { error: "Event not found." };
    }
    if (
      existing.status === "cancelled" ||
      existing.status === "archived"
    ) {
      return { error: "Cancelled or archived events cannot be edited." };
    }

    const { error } = await supabase
      .from("schedule_events")
      .update({
        ...validated.data,
        updated_by: user.id,
      })
      .eq("id", eventId)
      .eq("church_id", church.id);

    if (error) {
      return { error: "Unable to update the event. Please try again." };
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_EVENT_UPDATED,
      entityType: AuditEntityType.SCHEDULE_EVENT,
      entityId: eventId,
      metadata: {
        title: validated.data.title,
        previous_status: existing.status,
        status: validated.data.status,
      },
      ipAddress,
    });

    await writeScheduleChangeHistory({
      supabase,
      churchId: church.id,
      entityId: eventId,
      eventId,
      action: "schedule.event_updated",
      summary: `Updated event “${validated.data.title}”`,
      actorUserId: user.id,
      previousValues: {
        title: existing.title,
        status: existing.status,
        start_at: existing.start_at,
        end_at: existing.end_at,
      },
      newValues: {
        title: validated.data.title,
        status: validated.data.status,
        start_at: validated.data.start_at,
        end_at: validated.data.end_at,
      },
      changedFields: ["title", "status", "start_at", "end_at"],
    });

    revalidatePath("/schedule");
    revalidatePath("/schedule/calendar");
    revalidatePath("/schedule/events");
    revalidatePath(`/schedule/events/${eventId}`);
    redirect(`/schedule/events/${eventId}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: string }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return { error: "Unable to update the event. Please try again." };
  }
}

export async function cancelScheduleEventAction(
  eventId: string,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const supabase = await createClient();

    const { data: existing, error: existingError } = await supabase
      .from("schedule_events")
      .select("id, title, status, start_at, end_at")
      .eq("id", eventId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (existingError) {
      const hint = scheduleMigrationHintFromError(existingError.message);
      return { error: hint ?? "Unable to cancel the event." };
    }
    if (!existing) return { error: "Event not found." };
    if (existing.status === "cancelled") {
      return { success: true, eventId };
    }

    const { data: relatedShifts } = await supabase
      .from("schedule_shifts")
      .select("id")
      .eq("church_id", church.id)
      .eq("event_id", eventId);

    const shiftIds = (relatedShifts ?? []).map((row) => row.id as string);
    let recipientUserIds: string[] = [];
    if (shiftIds.length > 0) {
      const { data: assignees } = await supabase
        .from("shift_assignments")
        .select("user_id")
        .eq("church_id", church.id)
        .in("shift_id", shiftIds)
        .not("status", "in", '("declined","cancelled")');
      recipientUserIds = [
        ...new Set(
          (assignees ?? [])
            .map((row) => row.user_id as string | null)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
    }

    const { error } = await supabase
      .from("schedule_events")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", eventId)
      .eq("church_id", church.id);

    if (error) {
      return { error: "Unable to cancel the event. Please try again." };
    }

    // Soft-cancel related open shifts
    await supabase
      .from("schedule_shifts")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("church_id", church.id)
      .eq("event_id", eventId)
      .not("status", "in", '("cancelled","completed")');

    if (shiftIds.length > 0) {
      await supabase
        .from("shift_assignments")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        })
        .eq("church_id", church.id)
        .in("shift_id", shiftIds)
        .not("status", "in", '("declined","cancelled","completed")');
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_EVENT_CANCELLED,
      entityType: AuditEntityType.SCHEDULE_EVENT,
      entityId: eventId,
      metadata: { title: existing.title },
      ipAddress,
    });

    await writeScheduleChangeHistory({
      supabase,
      churchId: church.id,
      entityId: eventId,
      eventId,
      action: "schedule.event_cancelled",
      summary: `Cancelled event “${existing.title}”`,
      actorUserId: user.id,
      previousValues: { status: existing.status },
      newValues: { status: "cancelled" },
      changedFields: ["status"],
    });

    await notifyEventCancelled({
      churchId: church.id,
      createdBy: user.id,
      timeZone: church.timezone,
      eventId,
      eventTitle: existing.title,
      eventStart: existing.start_at,
      eventEnd: existing.end_at,
      recipientUserIds,
    });

    revalidatePath("/schedule");
    revalidatePath("/schedule/calendar");
    revalidatePath("/schedule/events");
    revalidatePath(`/schedule/events/${eventId}`);
    return { success: true, eventId };
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return { error: "Unable to cancel the event. Please try again." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { parseChurchDateTimeLocal } from "@/lib/datetime/format";
import {
  scheduleMigrationHintFromError,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import {
  canManageSchedule,
  canManageScheduleSettings,
} from "@/lib/schedule/permissions";
import { getScheduleTemplate } from "@/lib/schedule/settings-queries";
import { validateScheduleTemplateForm } from "@/lib/schedule/template-validation";
import type { ScheduleActionState } from "@/lib/schedule/types";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

async function requireSchedulingFeature(churchId: string) {
  await requireFeature({
    churchId,
    featureKey: FEATURE_KEYS.TEAM_SCHEDULING,
  });
}

async function requireTemplateAdmin() {
  const ctx = await getAuthenticatedUserWithChurch();
  if (!canManageScheduleSettings(ctx.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to manage schedule templates.",
    );
  }
  await requireSchedulingFeature(ctx.church.id);
  return ctx;
}

async function requireScheduleManager() {
  const ctx = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(ctx.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to apply schedule templates.",
    );
  }
  await requireSchedulingFeature(ctx.church.id);
  return ctx;
}

function revalidateTemplates(templateId?: string) {
  revalidatePath("/schedule/templates");
  revalidatePath("/schedule/events");
  revalidatePath("/schedule/shifts");
  revalidatePath("/schedule/calendar");
  if (templateId) revalidatePath(`/schedule/templates/${templateId}/edit`);
}

export async function createScheduleTemplateAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireTemplateAdmin();
    const validated = validateScheduleTemplateForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid template.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schedule_templates")
      .insert({
        church_id: church.id,
        ...validated.data,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        error:
          scheduleMigrationHintFromError(error?.message ?? "") ??
          SCHEDULE_MIGRATION_HINT,
      };
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_TEMPLATE_CREATED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: data.id,
      metadata: { name: validated.data.name },
      ipAddress,
    });

    revalidateTemplates(data.id);
    redirect(`/schedule/templates/${data.id}/edit`);
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    // Next.js redirect throws
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error ? error.message : "Unable to create template.",
    };
  }
}

export async function updateScheduleTemplateAction(
  templateId: string,
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireTemplateAdmin();
    const validated = validateScheduleTemplateForm(formData);
    if (!validated.data) {
      return {
        error: validated.error ?? "Invalid template.",
        fieldErrors: validated.fieldErrors,
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("schedule_templates")
      .update({
        ...validated.data,
        updated_by: user.id,
      })
      .eq("church_id", church.id)
      .eq("id", templateId);

    if (error) {
      return {
        error:
          scheduleMigrationHintFromError(error.message) ??
          "Unable to update template.",
      };
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_TEMPLATE_UPDATED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: templateId,
      metadata: { name: validated.data.name },
      ipAddress,
    });

    revalidateTemplates(templateId);
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error ? error.message : "Unable to update template.",
    };
  }
}

export async function archiveScheduleTemplateAction(
  templateId: string,
): Promise<void> {
  const { user, church } = await requireTemplateAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_templates")
    .update({ is_active: false, updated_by: user.id })
    .eq("church_id", church.id)
    .eq("id", templateId);

  if (error) {
    throw new Error(
      scheduleMigrationHintFromError(error.message) ??
        "Unable to archive template.",
    );
  }

  const ipAddress = await getRequestIpAddress();
  await writeAuditLog(supabase, {
    churchId: church.id,
    userId: user.id,
    action: AuditAction.SCHEDULE_TEMPLATE_ARCHIVED,
    entityType: AuditEntityType.SCHEDULE_TEMPLATE,
    entityId: templateId,
    ipAddress,
  });

  revalidateTemplates(templateId);
  redirect("/schedule/templates");
}

export async function applyScheduleTemplateAction(
  _prev: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  try {
    const { user, church } = await requireScheduleManager();
    const templateId = String(formData.get("template_id") ?? "").trim();
    const startLocal = String(formData.get("start_at") ?? "").trim();
    if (!templateId) return { error: "Select a template." };
    if (!startLocal) {
      return {
        error: "Choose a start date and time.",
        fieldErrors: { start_at: "Required." },
      };
    }

    const template = await getScheduleTemplate(church.id, templateId);
    if (!template || !template.is_active) {
      return { error: "Template not found or inactive." };
    }

    const timeZone = church.timezone ?? "America/Los_Angeles";
    const startAt = parseChurchDateTimeLocal(startLocal, timeZone);
    if (!startAt) {
      return {
        error: "Invalid start date and time.",
        fieldErrors: { start_at: "Invalid datetime." },
      };
    }
    const endAt = new Date(
      startAt.getTime() + template.default_duration_minutes * 60 * 1000,
    );

    const titleOverride = String(formData.get("title") ?? "").trim();
    const title = (titleOverride || template.name).slice(0, 200);
    const campusId =
      String(formData.get("campus_id") ?? "").trim() ||
      template.campus_id ||
      null;

    const supabase = await createClient();
    const { data: event, error: eventError } = await supabase
      .from("schedule_events")
      .insert({
        church_id: church.id,
        campus_id: campusId,
        title,
        description: template.description,
        event_type: template.event_type,
        status: "scheduled",
        location_name: template.default_location,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        all_day: false,
        timezone: timeZone,
        security_coverage_required: true,
        risk_level: "low",
        recommended_notification_group_ids:
          template.default_required_group_ids ?? [],
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (eventError || !event) {
      return {
        error:
          scheduleMigrationHintFromError(eventError?.message ?? "") ??
          "Unable to create event from template.",
      };
    }

    const shiftRows = template.default_shift_definitions.map((def) => {
      const shiftStart = new Date(
        startAt.getTime() + def.offset_minutes * 60 * 1000,
      );
      const shiftEnd = new Date(
        shiftStart.getTime() + def.duration_minutes * 60 * 1000,
      );
      return {
        church_id: church.id,
        campus_id: campusId,
        event_id: event.id,
        title: def.title,
        shift_type: def.shift_type,
        status: "open",
        start_at: shiftStart.toISOString(),
        end_at: shiftEnd.toISOString(),
        timezone: timeZone,
        location_name: def.location_name ?? template.default_location,
        required_member_count: def.required_member_count,
        notes: def.notes ?? null,
        created_by: user.id,
        updated_by: user.id,
      };
    });

    if (shiftRows.length > 0) {
      const { error: shiftError } = await supabase
        .from("schedule_shifts")
        .insert(shiftRows);
      if (shiftError) {
        return {
          error: `Event created, but shifts failed: ${shiftError.message}`,
          eventId: event.id,
        };
      }
    }

    const ipAddress = await getRequestIpAddress();
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_TEMPLATE_APPLIED,
      entityType: AuditEntityType.SCHEDULE_TEMPLATE,
      entityId: templateId,
      metadata: {
        event_id: event.id,
        shift_count: shiftRows.length,
        title,
      },
      ipAddress,
    });
    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SCHEDULE_EVENT_CREATED,
      entityType: AuditEntityType.SCHEDULE_EVENT,
      entityId: event.id,
      metadata: { from_template_id: templateId },
      ipAddress,
    });

    revalidateTemplates(templateId);
    revalidatePath(`/schedule/events/${event.id}`);
    redirect(`/schedule/events/${event.id}`);
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to apply schedule template.",
    };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getAuthenticatedUserWithChurch,
  getIncidentWithUpdates,
} from "@/lib/incidents/queries";
import type { ActionState, IncidentStatus } from "@/lib/incidents/types";
import {
  parseCreateIncidentInput,
  parseIncidentUpdateInput,
  validateCreateIncidentInput,
  validateIncidentUpdateInput,
} from "@/lib/incidents/validation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

export async function createIncident(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateCreateIncidentInput(formData);
  if (validation.error || validation.fieldErrors) {
    return validation;
  }

  let incidentId: string;

  try {
    const { supabase, user, profile } = await getAuthenticatedUserWithChurch();
    const input = parseCreateIncidentInput(formData);

    const { data: incident, error: incidentError } = await supabase
      .from("incidents")
      .insert({
        church_id: profile.church_id,
        created_by: user.id,
        title: input.title,
        type: input.type,
        severity: input.severity,
        status: "open",
        location: input.location,
        description: input.description || null,
        occurred_at: input.occurred_at,
      })
      .select("id")
      .single();

    if (incidentError || !incident) {
      return { error: incidentError?.message ?? "Failed to create incident." };
    }

    incidentId = incident.id;

    const { error: updateError } = await supabase.from("incident_updates").insert({
      incident_id: incident.id,
      church_id: profile.church_id,
      created_by: user.id,
      update_type: "created",
      content: "Incident reported.",
      new_status: "open",
    });

    if (updateError) {
      return { error: updateError.message };
    }

    await writeAuditLog(supabase, {
      churchId: profile.church_id,
      userId: user.id,
      action: AuditAction.INCIDENT_CREATED,
      entityType: AuditEntityType.INCIDENT,
      entityId: incident.id,
      metadata: {
        type: input.type,
        severity: input.severity,
        status: "open",
      },
      ipAddress: await getRequestIpAddress(),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create incident.",
    };
  }

  revalidatePath("/incidents");
  redirect(`/incidents/${incidentId}?created=1`);
}

export async function addIncidentUpdate(
  incidentId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateIncidentUpdateInput(formData);
  if (validation.error || validation.fieldErrors) {
    return validation;
  }

  try {
    const { supabase, user, profile } = await getAuthenticatedUserWithChurch();
    const incident = await getIncidentWithUpdates(incidentId);

    if (!incident || incident.church_id !== profile.church_id) {
      return { error: "Incident not found." };
    }

    const input = parseIncidentUpdateInput(formData);
    const previousStatus = incident.status;
    const nextStatus = (input.status as IncidentStatus | null) ?? previousStatus;
    const statusChanged =
      input.status !== null && input.status !== previousStatus;

    if (statusChanged) {
      const { error: statusError } = await supabase
        .from("incidents")
        .update({ status: nextStatus })
        .eq("id", incidentId)
        .eq("church_id", profile.church_id);

      if (statusError) {
        return { error: statusError.message };
      }
    }

    const content =
      input.content ||
      (statusChanged
        ? `Status changed from ${previousStatus} to ${nextStatus}.`
        : "");

    const { error: updateError } = await supabase.from("incident_updates").insert({
      incident_id: incidentId,
      church_id: profile.church_id,
      created_by: user.id,
      update_type: statusChanged ? "status_change" : "comment",
      content,
      previous_status: statusChanged ? previousStatus : null,
      new_status: statusChanged ? nextStatus : null,
    });

    if (updateError) {
      return { error: updateError.message };
    }

    await writeAuditLog(supabase, {
      churchId: profile.church_id,
      userId: user.id,
      action: AuditAction.INCIDENT_UPDATED,
      entityType: AuditEntityType.INCIDENT,
      entityId: incidentId,
      metadata: {
        status_changed: statusChanged,
        previous_status: statusChanged ? previousStatus : undefined,
        new_status: statusChanged ? nextStatus : undefined,
        update_type: statusChanged ? "status_change" : "comment",
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath(`/incidents/${incidentId}`);
    revalidatePath("/incidents");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to add incident update.",
    };
  }
}

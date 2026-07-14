"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getIncidentWithUpdates,
  getOperationalChurchContext,
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
import { hasMinRole } from "@/lib/church/navigation";

async function loadIncidentPolicy(churchId: string) {
  const { supabase, membership } = await getOperationalChurchContext();
  const { data } = await supabase
    .from("churches")
    .select(
      "require_incident_location, require_incident_severity, require_incident_follow_up, allow_security_members_create_incidents, allow_security_members_close_incidents",
    )
    .eq("id", churchId)
    .maybeSingle();

  return {
    supabase,
    membership,
    requireLocation: data?.require_incident_location ?? true,
    requireSeverity: data?.require_incident_severity ?? true,
    requireFollowUp: data?.require_incident_follow_up ?? false,
    allowMembersCreate: data?.allow_security_members_create_incidents ?? true,
    allowMembersClose: data?.allow_security_members_close_incidents ?? false,
  };
}

export async function createIncident(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let incidentId: string;

  try {
    const context = await getOperationalChurchContext();
    const policy = await loadIncidentPolicy(context.profile.church_id);

    if (
      context.membership.role === "security_member" &&
      !policy.allowMembersCreate
    ) {
      return {
        error:
          "Security members are not allowed to create incidents for this church.",
      };
    }

    if (context.membership.role === "viewer") {
      return { error: "Viewers cannot create incidents." };
    }

    const validation = validateCreateIncidentInput(formData, {
      requireLocation: policy.requireLocation,
      requireSeverity: policy.requireSeverity,
    });
    if (validation.error || validation.fieldErrors) {
      return validation;
    }

    const { supabase, user, profile } = context;
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

    const { error: updateError } = await supabase
      .from("incident_updates")
      .insert({
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
  try {
    const context = await getOperationalChurchContext();
    const policy = await loadIncidentPolicy(context.profile.church_id);
    const inputPreview = parseIncidentUpdateInput(formData);

    const validation = validateIncidentUpdateInput(formData, {
      requireFollowUpNotes: policy.requireFollowUp,
      nextStatus: inputPreview.status,
    });
    if (validation.error || validation.fieldErrors) {
      return validation;
    }

    const { supabase, user, profile, membership } = context;
    const incident = await getIncidentWithUpdates(incidentId);

    if (!incident || incident.church_id !== profile.church_id) {
      return { error: "Incident not found." };
    }

    const input = parseIncidentUpdateInput(formData);
    const previousStatus = incident.status;
    const nextStatus =
      (input.status as IncidentStatus | null) ?? previousStatus;
    const statusChanged =
      input.status !== null && input.status !== previousStatus;
    const isClosing =
      statusChanged &&
      (nextStatus === "closed" || nextStatus === "resolved");

    if (
      isClosing &&
      membership.role === "security_member" &&
      !policy.allowMembersClose
    ) {
      return {
        error:
          "Security members are not allowed to close or resolve incidents for this church.",
      };
    }

    if (membership.role === "viewer" && statusChanged) {
      return { error: "Viewers cannot change incident status." };
    }

    if (
      statusChanged &&
      !hasMinRole(membership.role, "security_member") &&
      membership.role !== "viewer"
    ) {
      // no-op — all ranked roles already filtered above
    }

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

    const { error: updateError } = await supabase
      .from("incident_updates")
      .insert({
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
        error instanceof Error
          ? error.message
          : "Failed to add incident update.",
    };
  }
}

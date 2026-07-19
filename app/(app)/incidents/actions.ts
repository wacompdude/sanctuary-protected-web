"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getIncidentWithUpdates,
  listActiveIncidentTeamMembers,
  listIncidentInvolvedMembers,
  getOperationalChurchContext,
} from "@/lib/incidents/queries";
import type { ActionState, IncidentStatus } from "@/lib/incidents/types";
import {
  parseCreateIncidentInput,
  parseIncidentUpdateInput,
  validateCreateIncidentInput,
  validateIncidentUpdateInput,
} from "@/lib/incidents/validation";
import {
  INCIDENT_MEDIA_BUCKET,
  INCIDENT_PHOTO_MAX_COUNT,
  collectPhotoFiles,
  incidentPhotoObjectPath,
  isIncidentMediaStoragePath,
  validateIncidentPhotoFile,
} from "@/lib/incidents/attachment-storage";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { hasMinRole } from "@/lib/church/navigation";
import { canRecordMedicalSupplyUsage } from "@/lib/medical-supplies/types";
import { createNotification } from "@/lib/notifications/create-notification";
import { mapIncidentSeverityToNotification } from "@/lib/notifications/constants";
import { canCreateOperationalNotifications } from "@/lib/notifications/permissions";
import { auditNotificationCreated } from "@/lib/audit/notification-events";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseMedicalSupplyUsages(formData: FormData): {
  supplyId: string;
  quantity: number;
}[] {
  const supplyIds = formData.getAll("medical_supply_ids").map(String);
  const quantities = formData.getAll("medical_supply_quantities").map(String);
  const rows: { supplyId: string; quantity: number }[] = [];

  for (let i = 0; i < supplyIds.length; i += 1) {
    const supplyId = supplyIds[i]?.trim();
    if (!supplyId) continue;
    const quantity = Number.parseInt(quantities[i] ?? "", 10);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    rows.push({ supplyId, quantity });
  }

  return rows;
}

function parseIncidentMemberIds(formData: FormData): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of formData.getAll("incident_member_ids")) {
    const value = String(raw).trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

async function recordIncidentTeamMembers(params: {
  supabase: SupabaseClient;
  churchId: string;
  incidentId: string;
  userId: string;
  membershipIds: string[];
}): Promise<string | null> {
  for (const membershipId of params.membershipIds) {
    const { data, error } = await params.supabase
      .from("incident_team_members")
      .insert({
        church_id: params.churchId,
        incident_id: params.incidentId,
        membership_id: membershipId,
        added_by: params.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      if (
        error?.message.includes("incident_team_members") ||
        error?.code === "42P01" ||
        error?.code === "PGRST205"
      ) {
        return "Run supabase/migrations/024_incident_team_members.sql in the Supabase SQL Editor to enable involved incident team members.";
      }
      return error?.message || "Unable to save one or more involved team members.";
    }

    await writeAuditLog(params.supabase, {
      churchId: params.churchId,
      userId: params.userId,
      action: AuditAction.INCIDENT_MEMBER_ADDED,
      entityType: AuditEntityType.INCIDENT_MEMBER,
      entityId: data.id,
      metadata: {
        incident_id: params.incidentId,
        membership_id: membershipId,
      },
      ipAddress: await getRequestIpAddress(),
    });
  }

  return null;
}

async function recordUsagesForIncident(params: {
  supabase: SupabaseClient;
  churchId: string;
  incidentId: string;
  userId: string;
  usages: { supplyId: string; quantity: number }[];
}): Promise<string | null> {
  for (const usage of params.usages) {
    const { data, error } = await params.supabase
      .from("medical_supply_usage")
      .insert({
        church_id: params.churchId,
        incident_id: params.incidentId,
        medical_supply_id: usage.supplyId,
        quantity_used: usage.quantity,
        recorded_by: params.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return (
        error?.message ||
        "Unable to record one or more medical supplies. Check on-hand quantities."
      );
    }

    await writeAuditLog(params.supabase, {
      churchId: params.churchId,
      userId: params.userId,
      action: AuditAction.MEDICAL_SUPPLY_USED,
      entityType: AuditEntityType.MEDICAL_SUPPLY_USAGE,
      entityId: data.id,
      metadata: {
        incident_id: params.incidentId,
        medical_supply_id: usage.supplyId,
        quantity_used: usage.quantity,
      },
      ipAddress: await getRequestIpAddress(),
    });
  }

  return null;
}

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

function canMutateIncidentPhotos(role: string): boolean {
  return role !== "viewer";
}

async function countIncidentPhotos(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("incident_attachments")
    .select("id", { count: "exact", head: true })
    .eq("incident_id", incidentId);
  if (error) {
    if (
      error.message.includes("incident_attachments") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      throw new Error(
        "Run supabase/migrations/021_incident_attachments.sql in the Supabase SQL Editor to enable incident photos.",
      );
    }
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function uploadIncidentPhotoFiles(params: {
  supabase: SupabaseClient;
  churchId: string;
  incidentId: string;
  userId: string;
  files: File[];
}): Promise<{ uploaded: number; error?: string }> {
  const { supabase, churchId, incidentId, userId, files } = params;
  if (files.length === 0) return { uploaded: 0 };

  const existing = await countIncidentPhotos(supabase, incidentId);
  if (existing + files.length > INCIDENT_PHOTO_MAX_COUNT) {
    return {
      uploaded: 0,
      error: `Incidents can have at most ${INCIDENT_PHOTO_MAX_COUNT} photos (${existing} already attached).`,
    };
  }

  for (const file of files) {
    const fileError = validateIncidentPhotoFile(file);
    if (fileError) {
      return { uploaded: 0, error: fileError };
    }
  }

  let uploaded = 0;

  for (const file of files) {
    const objectPath = incidentPhotoObjectPath({
      churchId,
      incidentId,
      mimeType: file.type,
    });
    if (!objectPath) {
      return { uploaded, error: "Unsupported image type." };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(INCIDENT_MEDIA_BUCKET)
      .upload(objectPath, bytes, {
        upsert: false,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      return {
        uploaded,
        error:
          uploadError.message.includes("Bucket not found") ||
          uploadError.message.includes("not found")
            ? "Run supabase/migrations/021_incident_attachments.sql in the Supabase SQL Editor to enable incident photos."
            : uploadError.message || "Unable to upload a photo.",
      };
    }

    const { data: row, error: insertError } = await supabase
      .from("incident_attachments")
      .insert({
        church_id: churchId,
        incident_id: incidentId,
        uploaded_by: userId,
        storage_path: objectPath,
        mime_type: file.type,
        byte_size: file.size,
        original_filename: file.name?.slice(0, 255) || null,
      })
      .select("id")
      .single();

    if (insertError || !row) {
      await supabase.storage.from(INCIDENT_MEDIA_BUCKET).remove([objectPath]);
      return {
        uploaded,
        error:
          insertError?.message ||
          "Unable to save photo metadata. Confirm migration 021 has been applied.",
      };
    }

    uploaded += 1;

    await writeAuditLog(supabase, {
      churchId,
      userId,
      action: AuditAction.INCIDENT_PHOTO_ADDED,
      entityType: AuditEntityType.INCIDENT_ATTACHMENT,
      entityId: row.id,
      metadata: {
        incident_id: incidentId,
        storage_path: objectPath,
        mime_type: file.type,
        byte_size: file.size,
      },
      ipAddress: await getRequestIpAddress(),
    });
  }

  return { uploaded };
}

export async function createIncident(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let incidentId: string | undefined;
  let photoError: string | undefined;
  let memberError: string | undefined;
  let supplyError: string | undefined;

  try {
    const context = await getOperationalChurchContext();
    const policy = await loadIncidentPolicy(context.church.id);

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
      timeZone: context.church.timezone,
    });
    if (validation.error || validation.fieldErrors) {
      return validation;
    }

    const photoFiles = collectPhotoFiles(formData);
    if (photoFiles.length > INCIDENT_PHOTO_MAX_COUNT) {
      return {
        fieldErrors: {
          photos: `You can attach at most ${INCIDENT_PHOTO_MAX_COUNT} photos.`,
        },
      };
    }
    for (const file of photoFiles) {
      const fileError = validateIncidentPhotoFile(file);
      if (fileError) {
        return { fieldErrors: { photos: fileError } };
      }
    }

    const { supabase, user, church } = context;
    const input = parseCreateIncidentInput(formData, {
      timeZone: church.timezone,
    });
    const involvedMemberIds = parseIncidentMemberIds(formData);
    const medicalUsages =
      input.type === "medical" ? parseMedicalSupplyUsages(formData) : [];

    if (involvedMemberIds.length > 0) {
      const availableMembers = await listActiveIncidentTeamMembers(church.id).catch(
        () => [],
      );
      const allowedIds = new Set(
        availableMembers.map((member) => member.membershipId),
      );
      const hasInvalidMember = involvedMemberIds.some((id) => !allowedIds.has(id));
      if (hasInvalidMember) {
        return {
          fieldErrors: {
            incident_members:
              "Choose valid active security team members for this incident.",
          },
          error: "Please fix the highlighted fields.",
        };
      }
    }

    if (medicalUsages.length > 0 && !canRecordMedicalSupplyUsage(context.membership.role)) {
      return {
        fieldErrors: {
          medical_supplies:
            "You do not have permission to record medical supply usage.",
        },
      };
    }

    const { data: incident, error: incidentError } = await supabase
      .from("incidents")
      .insert({
        church_id: church.id,
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
        church_id: church.id,
        created_by: user.id,
        update_type: "created",
        content: "Incident reported.",
        new_status: "open",
      });

    if (updateError) {
      return { error: updateError.message };
    }

    let photoCount = 0;
    if (photoFiles.length > 0) {
      const photoResult = await uploadIncidentPhotoFiles({
        supabase,
        churchId: church.id,
        incidentId: incident.id,
        userId: user.id,
        files: photoFiles,
      });
      photoCount = photoResult.uploaded;
      if (photoResult.error) {
        photoError = photoResult.error;
      }
    }

    if (medicalUsages.length > 0) {
      const usageError = await recordUsagesForIncident({
        supabase,
        churchId: church.id,
        incidentId: incident.id,
        userId: user.id,
        usages: medicalUsages,
      });
      if (usageError) {
        supplyError = usageError;
      }
    }

    if (involvedMemberIds.length > 0) {
      const incidentMemberError = await recordIncidentTeamMembers({
        supabase,
        churchId: church.id,
        incidentId: incident.id,
        userId: user.id,
        membershipIds: involvedMemberIds,
      });
      if (incidentMemberError) {
        memberError = incidentMemberError;
      }
    }

    const skipNotification =
      formData.get("skip_notification") === "1" ||
      formData.get("skip_notification") === "on" ||
      formData.get("skip_notification") === "true";

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.INCIDENT_CREATED,
      entityType: AuditEntityType.INCIDENT,
      entityId: incident.id,
      metadata: {
        type: input.type,
        severity: input.severity,
        status: "open",
        photo_count: photoCount,
        photo_error: photoError,
        involved_member_count: involvedMemberIds.length,
        involved_member_error: memberError,
        medical_supply_count: medicalUsages.length,
        medical_supply_error: supplyError,
        notification_skipped: skipNotification,
      },
      ipAddress: await getRequestIpAddress(),
    });

    // Await notification create before redirect — fire-and-forget is dropped on Vercel.
    if (
      !skipNotification &&
      (input.severity === "critical" || input.severity === "high")
    ) {
      const notificationType =
        input.severity === "critical" ? "incident.critical" : "incident.created";
      try {
        const notifyResult = await createNotification({
          churchId: church.id,
          createdBy: user.id,
          notificationType,
          severity: mapIncidentSeverityToNotification(input.severity),
          entityType: "incident",
          entityId: incident.id,
          actionUrl: `/incidents/${incident.id}`,
          deduplicationKey: `${notificationType}:${incident.id}`,
          templateVariables: {
            incident_title: input.title,
            incident_severity: input.severity,
            incident_location: input.location ?? "",
            incident_time: input.occurred_at,
          },
        });
        if (notifyResult.error) {
          console.error(
            "createNotification failed for incident:",
            notifyResult.error,
          );
        }
      } catch (err: unknown) {
        console.error("createNotification failed for incident:", err);
      }
    }

  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create incident.",
    };
  }

  if (!incidentId) {
    return { error: "Failed to create incident." };
  }

  revalidatePath("/incidents");
  revalidatePath("/medical-supplies");
  revalidatePath("/medical-supplies/restock");
  revalidatePath(`/incidents/${incidentId}`);

  const params = new URLSearchParams({ created: "1" });
  if (photoError) params.set("photo_error", photoError);
  if (memberError) params.set("member_error", memberError);
  if (supplyError) params.set("supply_error", supplyError);
  redirect(`/incidents/${incidentId}?${params.toString()}`);
}

export async function resendIncidentNotificationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (!canCreateOperationalNotifications(membership.role)) {
      return {
        error: "You do not have permission to resend incident notifications.",
      };
    }

    const incidentId = String(formData.get("incident_id") ?? "").trim();
    if (!incidentId) {
      return { error: "Incident is required." };
    }

    const incident = await getIncidentWithUpdates(incidentId);
    if (!incident || incident.church_id !== church.id) {
      return { error: "Incident not found." };
    }

    if (incident.severity !== "critical" && incident.severity !== "high") {
      return {
        error: "Email alerts are only available for high and critical incidents.",
      };
    }

    const notificationType =
      incident.severity === "critical" ? "incident.critical" : "incident.created";

    const result = await createNotification(
      {
        churchId: church.id,
        createdBy: user.id,
        notificationType,
        severity: mapIncidentSeverityToNotification(incident.severity),
        entityType: "incident",
        entityId: incident.id,
        actionUrl: `/incidents/${incident.id}`,
        deduplicationKey: `${notificationType}:${incident.id}:resend:${new Date().toISOString()}`,
        templateVariables: {
          incident_title: incident.title,
          incident_severity: incident.severity,
          incident_location: incident.location ?? "",
          incident_time: incident.occurred_at,
        },
      },
      { dispatchNow: true },
    );

    if (result.error) {
      return { error: result.error };
    }
    if (result.status === "skipped") {
      return { error: "Notification could not be sent." };
    }

    if (result.notificationId) {
      await auditNotificationCreated(supabase, {
        churchId: church.id,
        userId: user.id,
        notificationId: result.notificationId,
        notificationType,
        severity: mapIncidentSeverityToNotification(incident.severity),
        recipientCount: result.recipientCount,
      });
    }

    revalidatePath(`/incidents/${incidentId}`);
    revalidatePath("/notifications");
    revalidatePath("/notifications/history");

    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to resend incident notification.",
    };
  }
}

export async function addIncidentUpdate(
  incidentId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const policy = await loadIncidentPolicy(context.church.id);
    const inputPreview = parseIncidentUpdateInput(formData);

    const validation = validateIncidentUpdateInput(formData, {
      requireFollowUpNotes: policy.requireFollowUp,
      nextStatus: inputPreview.status,
    });
    if (validation.error || validation.fieldErrors) {
      return validation;
    }

    const { supabase, user, church, membership } = context;
    const incident = await getIncidentWithUpdates(incidentId);

    if (!incident || incident.church_id !== church.id) {
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
        .eq("church_id", church.id);

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
        church_id: church.id,
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
      churchId: church.id,
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

export async function addIncidentTeamMember(
  incidentId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (membership.role === "viewer") {
      return { error: "Viewers cannot manage involved team members." };
    }

    const membershipId = String(formData.get("membership_id") ?? "").trim();
    if (!membershipId) {
      return {
        fieldErrors: { membership_id: "Select a team member." },
        error: "Please fix the highlighted fields.",
      };
    }

    const incident = await getIncidentWithUpdates(incidentId);
    if (!incident || incident.church_id !== church.id) {
      return { error: "Incident not found." };
    }

    const availableMembers = await listActiveIncidentTeamMembers(church.id);
    const targetMember = availableMembers.find(
      (memberRow) => memberRow.membershipId === membershipId,
    );

    if (!targetMember) {
      return {
        fieldErrors: {
          membership_id: "Choose an active security team member.",
        },
        error: "Please fix the highlighted fields.",
      };
    }

    const existing = await listIncidentInvolvedMembers(church.id, incidentId);
    if (existing.some((memberRow) => memberRow.membership_id === membershipId)) {
      return { error: "That team member is already attached to this incident." };
    }

    const recordError = await recordIncidentTeamMembers({
      supabase,
      churchId: church.id,
      incidentId,
      userId: user.id,
      membershipIds: [membershipId],
    });

    if (recordError) {
      return { error: recordError };
    }

    revalidatePath(`/incidents/${incidentId}`);
    revalidatePath("/incidents");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to add incident team member.",
    };
  }
}

export async function removeIncidentTeamMember(
  incidentMemberId: string,
  incidentId: string,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (membership.role === "viewer") {
      return { error: "Viewers cannot manage involved team members." };
    }

    const { data: incidentMember, error } = await supabase
      .from("incident_team_members")
      .select("id, incident_id, membership_id, church_id")
      .eq("id", incidentMemberId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (error) {
      if (
        error.message.includes("incident_team_members") ||
        error.code === "42P01" ||
        error.code === "PGRST205"
      ) {
        return {
          error:
            "Run supabase/migrations/024_incident_team_members.sql in the Supabase SQL Editor to enable involved incident team members.",
        };
      }
      return { error: error.message };
    }

    if (!incidentMember || incidentMember.incident_id !== incidentId) {
      return { error: "Incident team member not found." };
    }

    const { error: deleteError } = await supabase
      .from("incident_team_members")
      .delete()
      .eq("id", incidentMemberId)
      .eq("church_id", church.id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.INCIDENT_MEMBER_REMOVED,
      entityType: AuditEntityType.INCIDENT_MEMBER,
      entityId: incidentMemberId,
      metadata: {
        incident_id: incidentId,
        membership_id: incidentMember.membership_id,
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
          : "Failed to remove incident team member.",
    };
  }
}

export async function uploadIncidentPhotos(
  incidentId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (!canMutateIncidentPhotos(membership.role)) {
      return { error: "Viewers cannot upload incident photos." };
    }

    const incident = await getIncidentWithUpdates(incidentId);
    if (!incident || incident.church_id !== church.id) {
      return { error: "Incident not found." };
    }

    const files = collectPhotoFiles(formData);
    if (files.length === 0) {
      return { fieldErrors: { photos: "Choose at least one photo to upload." } };
    }

    const result = await uploadIncidentPhotoFiles({
      supabase,
      churchId: church.id,
      incidentId,
      userId: user.id,
      files,
    });

    if (result.error) {
      return {
        error: result.error,
        fieldErrors: { photos: result.error },
      };
    }

    if (result.uploaded > 0) {
      await supabase.from("incident_updates").insert({
        incident_id: incidentId,
        church_id: church.id,
        created_by: user.id,
        update_type: "comment",
        content:
          result.uploaded === 1
            ? "Added 1 photo."
            : `Added ${result.uploaded} photos.`,
      });
    }

    revalidatePath(`/incidents/${incidentId}`);
    revalidatePath("/incidents");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to upload incident photos.",
    };
  }
}

export async function deleteIncidentPhoto(
  attachmentId: string,
): Promise<ActionState> {
  try {
    const context = await getOperationalChurchContext();
    const { supabase, user, church, membership } = context;

    if (!canMutateIncidentPhotos(membership.role)) {
      return { error: "Viewers cannot remove incident photos." };
    }

    const { data: attachment, error } = await supabase
      .from("incident_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (error || !attachment) {
      return { error: error?.message || "Photo not found." };
    }

    const isLeader = hasMinRole(membership.role, "security_leader");
    if (attachment.uploaded_by !== user.id && !isLeader) {
      return { error: "You can only remove photos you uploaded." };
    }

    if (
      !isIncidentMediaStoragePath(
        attachment.storage_path,
        church.id,
        attachment.incident_id,
      )
    ) {
      return { error: "Invalid photo storage path." };
    }

    const { error: deleteRowError } = await supabase
      .from("incident_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("church_id", church.id);

    if (deleteRowError) {
      return { error: deleteRowError.message };
    }

    await supabase.storage
      .from(INCIDENT_MEDIA_BUCKET)
      .remove([attachment.storage_path]);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.INCIDENT_PHOTO_REMOVED,
      entityType: AuditEntityType.INCIDENT_ATTACHMENT,
      entityId: attachmentId,
      metadata: {
        incident_id: attachment.incident_id,
        storage_path: attachment.storage_path,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath(`/incidents/${attachment.incident_id}`);
    revalidatePath("/incidents");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove incident photo.",
    };
  }
}

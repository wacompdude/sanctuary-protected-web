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
import type { SupabaseClient } from "@supabase/supabase-js";

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
  let incidentId: string;
  let photoError: string | undefined;

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
    const input = parseCreateIncidentInput(formData);

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
  if (photoError) {
    redirect(
      `/incidents/${incidentId}?created=1&photo_error=${encodeURIComponent(photoError)}`,
    );
  }
  redirect(`/incidents/${incidentId}?created=1`);
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { getOperationalChurchContext } from "@/lib/church/auth";
import {
  collectSafetyConcernPhotoFiles,
  safetyConcernPhotoObjectPath,
  validateSafetyConcernPhotoBytes,
  SAFETY_CONCERN_MEDIA_BUCKET,
} from "@/lib/safety-concerns/attachment-storage";
import {
  requireSafetyConcernPhotoUpload,
  requireSafetyConcernProfileCapacity,
  requireSafetyConcernWrite,
} from "@/lib/safety-concerns/entitlements";
import { canManageSafetyConcerns } from "@/lib/safety-concerns/permissions";
import { removeSafetyConcernPhotoObject } from "@/lib/safety-concerns/photo-urls";
import {
  countActiveSafetyConcernProfiles,
  getSafetyConcernActivationBlockers,
  getSafetyConcernChurchSettings,
  getSafetyConcernProfile,
  listSafetyConcernPhotos,
} from "@/lib/safety-concerns/queries";
import type { SafetyConcernActionState } from "@/lib/safety-concerns/types";
import {
  validateSafetyConcernIncidentLinkForm,
  validateSafetyConcernPhotoMetaForm,
  validateSafetyConcernProfileForm,
} from "@/lib/safety-concerns/validation";
import {
  entitlementErrorMessage,
  isEntitlementError,
} from "@/lib/subscriptions/enforcement";
import { SAFETY_CONCERN_REVIEW_OUTCOMES } from "@/lib/safety-concerns/constants";

function revalidateSafetyPaths(profileId?: string) {
  revalidatePath("/safety-concerns");
  if (profileId) {
    revalidatePath(`/safety-concerns/${profileId}`);
    revalidatePath(`/safety-concerns/${profileId}/edit`);
    revalidatePath(`/safety-concerns/${profileId}/photos`);
    revalidatePath(`/safety-concerns/${profileId}/history`);
  }
}

async function syncProfileCampuses(params: {
  supabase: Awaited<
    ReturnType<typeof getOperationalChurchContext>
  >["supabase"];
  churchId: string;
  profileId: string;
  scopeType: string;
  primaryCampusId: string | null;
  campusIds: string[];
}) {
  await params.supabase
    .from("safety_concern_profile_campuses")
    .delete()
    .eq("organization_id", params.churchId)
    .eq("profile_id", params.profileId);

  const ids = new Set<string>();
  if (params.scopeType === "campus_specific" && params.primaryCampusId) {
    ids.add(params.primaryCampusId);
  }
  if (params.scopeType === "selected_campuses") {
    for (const id of params.campusIds) ids.add(id);
  }

  if (ids.size === 0) return;

  const { error } = await params.supabase
    .from("safety_concern_profile_campuses")
    .insert(
      [...ids].map((campus_id) => ({
        organization_id: params.churchId,
        profile_id: params.profileId,
        campus_id,
      })),
    );

  if (error) {
    throw new Error(error.message);
  }
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function createSafetyConcernProfile(
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  let profileId = "";

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSafetyConcerns(membership.role)) {
      return {
        error: "You do not have permission to create Safety Concern Profiles.",
      };
    }

    await requireSafetyConcernWrite({
      churchId: church.id,
      role: membership.role,
    });

    const validation = validateSafetyConcernProfileForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const settings = await getSafetyConcernChurchSettings(church.id);

    if (input.profile_status === "active") {
      const blockers = await getSafetyConcernActivationBlockers({
        churchId: church.id,
        profileId: null,
        settings,
        client: supabase,
      });
      if (blockers.length > 0) {
        return { error: blockers[0] };
      }

      const activeCount = await countActiveSafetyConcernProfiles(church.id);
      await requireSafetyConcernProfileCapacity({
        churchId: church.id,
        role: membership.role,
        currentActiveCount: activeCount,
      });
    }

    const nextReview =
      input.next_review_date ??
      (input.profile_status === "active"
        ? addDaysIso(settings.review_interval_days)
        : null);

    const { data, error } = await supabase
      .from("safety_concern_profiles")
      .insert({
        organization_id: church.id,
        display_name: input.display_name,
        known_aliases: input.known_aliases,
        scope_type: input.scope_type,
        primary_campus_id: input.primary_campus_id,
        profile_status: input.profile_status,
        risk_context: input.risk_context,
        restriction_type: input.restriction_type,
        restriction_status: input.restriction_status,
        restriction_start_date: input.restriction_start_date,
        restriction_end_date: input.restriction_end_date,
        restriction_reference: input.restriction_reference,
        short_note: input.short_note,
        response_guidance: input.response_guidance,
        general_notes: input.general_notes,
        last_known_context: input.last_known_context,
        related_incident_summary: input.related_incident_summary,
        next_review_date: nextReview,
        expires_at: input.expires_at,
        approved_by:
          input.profile_status === "active" ? user.id : null,
        approved_at:
          input.profile_status === "active" ? new Date().toISOString() : null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        error:
          error?.message ||
          "Unable to create profile. Confirm migration 048 has been applied.",
      };
    }

    profileId = data.id;

    await syncProfileCampuses({
      supabase,
      churchId: church.id,
      profileId,
      scopeType: input.scope_type,
      primaryCampusId: input.primary_campus_id,
      campusIds: input.campus_ids,
    });

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SAFETY_CONCERN_PROFILE_CREATED,
      entityType: AuditEntityType.SAFETY_CONCERN_PROFILE,
      entityId: profileId,
      metadata: {
        profile_status: input.profile_status,
        scope_type: input.scope_type,
        risk_context: input.risk_context,
      },
      ipAddress: await getRequestIpAddress(),
    });
  } catch (error) {
    return {
      error: isEntitlementError(error)
        ? entitlementErrorMessage(error)
        : error instanceof Error
          ? error.message
          : "Failed to create Safety Concern Profile.",
    };
  }

  revalidateSafetyPaths(profileId);
  redirect(`/safety-concerns/${profileId}`);
}

export async function updateSafetyConcernProfile(
  profileId: string,
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSafetyConcerns(membership.role)) {
      return {
        error: "You do not have permission to edit Safety Concern Profiles.",
      };
    }

    await requireSafetyConcernWrite({
      churchId: church.id,
      role: membership.role,
    });

    const existing = await getSafetyConcernProfile(church.id, profileId);
    if (!existing) return { error: "Profile not found." };

    const validation = validateSafetyConcernProfileForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const input = validation.data;
    const becomingActive =
      input.profile_status === "active" && existing.profile_status !== "active";

    if (becomingActive) {
      const settings = await getSafetyConcernChurchSettings(church.id);
      const blockers = await getSafetyConcernActivationBlockers({
        churchId: church.id,
        profileId,
        settings,
        client: supabase,
      });
      if (blockers.length > 0) {
        return { error: blockers[0] };
      }

      const activeCount = await countActiveSafetyConcernProfiles(church.id);
      await requireSafetyConcernProfileCapacity({
        churchId: church.id,
        role: membership.role,
        currentActiveCount: activeCount,
      });
    }

    const { error } = await supabase
      .from("safety_concern_profiles")
      .update({
        display_name: input.display_name,
        known_aliases: input.known_aliases,
        scope_type: input.scope_type,
        primary_campus_id: input.primary_campus_id,
        profile_status: input.profile_status,
        risk_context: input.risk_context,
        restriction_type: input.restriction_type,
        restriction_status: input.restriction_status,
        restriction_start_date: input.restriction_start_date,
        restriction_end_date: input.restriction_end_date,
        restriction_reference: input.restriction_reference,
        short_note: input.short_note,
        response_guidance: input.response_guidance,
        general_notes: input.general_notes,
        last_known_context: input.last_known_context,
        related_incident_summary: input.related_incident_summary,
        next_review_date: input.next_review_date,
        expires_at: input.expires_at,
        approved_by: becomingActive ? user.id : existing.approved_by,
        approved_at: becomingActive
          ? new Date().toISOString()
          : existing.approved_at,
        updated_by: user.id,
        archived_at:
          input.profile_status === "archived"
            ? (existing.archived_at ?? new Date().toISOString())
            : null,
        archived_by:
          input.profile_status === "archived"
            ? (existing.archived_by ?? user.id)
            : null,
      })
      .eq("id", profileId)
      .eq("organization_id", church.id);

    if (error) return { error: error.message };

    await syncProfileCampuses({
      supabase,
      churchId: church.id,
      profileId,
      scopeType: input.scope_type,
      primaryCampusId: input.primary_campus_id,
      campusIds: input.campus_ids,
    });

    const restrictionChanged =
      existing.restriction_type !== input.restriction_type ||
      existing.restriction_status !== input.restriction_status;

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: restrictionChanged
        ? AuditAction.SAFETY_CONCERN_RESTRICTION_UPDATED
        : AuditAction.SAFETY_CONCERN_PROFILE_UPDATED,
      entityType: AuditEntityType.SAFETY_CONCERN_PROFILE,
      entityId: profileId,
      metadata: {
        profile_status: input.profile_status,
        scope_type: input.scope_type,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateSafetyPaths(profileId);
    return { success: true };
  } catch (error) {
    return {
      error: isEntitlementError(error)
        ? entitlementErrorMessage(error)
        : error instanceof Error
          ? error.message
          : "Failed to update Safety Concern Profile.",
    };
  }
}

export async function archiveSafetyConcernProfile(
  profileId: string,
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    await requireSafetyConcernWrite({
      churchId: church.id,
      role: membership.role,
    });

    const reason = String(formData.get("archive_reason") ?? "").trim().slice(0, 500);
    const { error } = await supabase
      .from("safety_concern_profiles")
      .update({
        profile_status: "archived",
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: reason || null,
        updated_by: user.id,
      })
      .eq("id", profileId)
      .eq("organization_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SAFETY_CONCERN_PROFILE_ARCHIVED,
      entityType: AuditEntityType.SAFETY_CONCERN_PROFILE,
      entityId: profileId,
      metadata: { has_reason: Boolean(reason) },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateSafetyPaths(profileId);
    return { success: true };
  } catch (error) {
    return {
      error: isEntitlementError(error)
        ? entitlementErrorMessage(error)
        : error instanceof Error
          ? error.message
          : "Failed to archive profile.",
    };
  }
}

export async function restoreSafetyConcernProfile(
  profileId: string,
): Promise<void> {
  const { supabase, user, church, membership } =
    await getOperationalChurchContext();

  await requireSafetyConcernWrite({
    churchId: church.id,
    role: membership.role,
  });

  const { error } = await supabase
    .from("safety_concern_profiles")
    .update({
      profile_status: "under_review",
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      updated_by: user.id,
    })
    .eq("id", profileId)
    .eq("organization_id", church.id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    churchId: church.id,
    userId: user.id,
    action: AuditAction.SAFETY_CONCERN_PROFILE_RESTORED,
    entityType: AuditEntityType.SAFETY_CONCERN_PROFILE,
    entityId: profileId,
    metadata: {},
    ipAddress: await getRequestIpAddress(),
  });

  revalidateSafetyPaths(profileId);
}

export async function uploadSafetyConcernPhoto(
  profileId: string,
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  const uploadedPaths: string[] = [];

  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    await requireSafetyConcernWrite({
      churchId: church.id,
      role: membership.role,
    });

    const profile = await getSafetyConcernProfile(church.id, profileId);
    if (!profile) return { error: "Profile not found." };

    const files = collectSafetyConcernPhotoFiles(formData);
    if (files.length === 0) {
      return { fieldErrors: { photos: "Choose at least one photo." } };
    }

    const existing = await listSafetyConcernPhotos(church.id, profileId);
    const limits = await requireSafetyConcernPhotoUpload({
      churchId: church.id,
      role: membership.role,
      existingCount: existing.length,
      newCount: files.length,
      files,
    });

    const meta = validateSafetyConcernPhotoMetaForm(formData);
    if (meta.fieldErrors || !meta.data) {
      return { fieldErrors: meta.fieldErrors };
    }

    let order = existing.length;
    for (const file of files) {
      const bytesCheck = await validateSafetyConcernPhotoBytes({
        file,
        maxBytes: limits.maxBytes,
      });
      if (!bytesCheck.ok) {
        return { fieldErrors: { photos: bytesCheck.error } };
      }

      const objectPath = safetyConcernPhotoObjectPath({
        churchId: church.id,
        profileId,
        mimeType: bytesCheck.mimeType,
      });
      if (!objectPath) {
        return { error: "Unable to build storage path for photo." };
      }

      const { error: uploadError } = await supabase.storage
        .from(SAFETY_CONCERN_MEDIA_BUCKET)
        .upload(objectPath, file, {
          contentType: bytesCheck.mimeType,
          upsert: false,
        });

      if (uploadError) {
        return { error: uploadError.message };
      }
      uploadedPaths.push(objectPath);

      const isPrimary =
        meta.data.is_primary || (existing.length === 0 && order === 0);

      if (isPrimary) {
        await supabase
          .from("safety_concern_photos")
          .update({ is_primary: false })
          .eq("organization_id", church.id)
          .eq("profile_id", profileId);
      }

      const { data: row, error: insertError } = await supabase
        .from("safety_concern_photos")
        .insert({
          organization_id: church.id,
          profile_id: profileId,
          storage_path: objectPath,
          file_name: file.name.slice(0, 255) || null,
          mime_type: bytesCheck.mimeType,
          file_size_bytes: file.size,
          photo_context_note: meta.data.photo_context_note,
          is_primary: isPrimary,
          display_order: order,
          source_type: meta.data.source_type,
          source_reference: meta.data.source_reference,
          taken_at: meta.data.taken_at,
          uploaded_by: user.id,
        })
        .select("id")
        .single();

      if (insertError || !row) {
        await removeSafetyConcernPhotoObject({
          supabase,
          storagePath: objectPath,
        });
        return {
          error:
            insertError?.message ||
            "Unable to save photo metadata. Confirm migration 048 has been applied.",
        };
      }

      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.SAFETY_CONCERN_PHOTO_UPLOADED,
        entityType: AuditEntityType.SAFETY_CONCERN_PHOTO,
        entityId: row.id,
        metadata: {
          profile_id: profileId,
          mime_type: bytesCheck.mimeType,
          byte_size: file.size,
        },
        ipAddress: await getRequestIpAddress(),
      });

      order += 1;
    }

    revalidateSafetyPaths(profileId);
    return { success: true };
  } catch (error) {
    for (const path of uploadedPaths) {
      try {
        const { createClient } = await import("@/lib/supabase/server");
        const supabase = await createClient();
        await removeSafetyConcernPhotoObject({ supabase, storagePath: path });
      } catch {
        // best-effort cleanup
      }
    }
    return {
      error: isEntitlementError(error)
        ? entitlementErrorMessage(error)
        : error instanceof Error
          ? error.message
          : "Failed to upload photo.",
    };
  }
}

export async function archiveSafetyConcernPhoto(
  profileId: string,
  photoId: string,
): Promise<void> {
  const { supabase, user, church, membership } =
    await getOperationalChurchContext();

  await requireSafetyConcernWrite({
    churchId: church.id,
    role: membership.role,
  });

  const { error } = await supabase
    .from("safety_concern_photos")
    .update({
      archived_at: new Date().toISOString(),
      is_primary: false,
    })
    .eq("id", photoId)
    .eq("profile_id", profileId)
    .eq("organization_id", church.id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    churchId: church.id,
    userId: user.id,
    action: AuditAction.SAFETY_CONCERN_PHOTO_ARCHIVED,
    entityType: AuditEntityType.SAFETY_CONCERN_PHOTO,
    entityId: photoId,
    metadata: { profile_id: profileId },
    ipAddress: await getRequestIpAddress(),
  });

  revalidateSafetyPaths(profileId);
}

export async function linkSafetyConcernIncident(
  profileId: string,
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    await requireSafetyConcernWrite({
      churchId: church.id,
      role: membership.role,
    });

    const validation = validateSafetyConcernIncidentLinkForm(formData);
    if (validation.fieldErrors || !validation.data) {
      return { fieldErrors: validation.fieldErrors };
    }

    const { data: incident } = await supabase
      .from("incidents")
      .select("id")
      .eq("id", validation.data.incident_id)
      .eq("organization_id", church.id)
      .maybeSingle();

    if (!incident) {
      return { fieldErrors: { incident_id: "Incident not found for this church." } };
    }

    const { data, error } = await supabase
      .from("safety_concern_incidents")
      .insert({
        organization_id: church.id,
        profile_id: profileId,
        incident_id: validation.data.incident_id,
        relationship_type: validation.data.relationship_type,
        notes: validation.data.notes,
        linked_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message || "Unable to link incident." };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SAFETY_CONCERN_INCIDENT_LINKED,
      entityType: AuditEntityType.SAFETY_CONCERN_INCIDENT,
      entityId: data.id,
      metadata: {
        profile_id: profileId,
        incident_id: validation.data.incident_id,
        relationship_type: validation.data.relationship_type,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateSafetyPaths(profileId);
    return { success: true };
  } catch (error) {
    return {
      error: isEntitlementError(error)
        ? entitlementErrorMessage(error)
        : error instanceof Error
          ? error.message
          : "Failed to link incident.",
    };
  }
}

export async function unlinkSafetyConcernIncident(
  profileId: string,
  linkId: string,
): Promise<void> {
  const { supabase, user, church, membership } =
    await getOperationalChurchContext();

  await requireSafetyConcernWrite({
    churchId: church.id,
    role: membership.role,
  });

  const { error } = await supabase
    .from("safety_concern_incidents")
    .delete()
    .eq("id", linkId)
    .eq("profile_id", profileId)
    .eq("organization_id", church.id);

  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(supabase, {
    churchId: church.id,
    userId: user.id,
    action: AuditAction.SAFETY_CONCERN_INCIDENT_UNLINKED,
    entityType: AuditEntityType.SAFETY_CONCERN_INCIDENT,
    entityId: linkId,
    metadata: { profile_id: profileId },
    ipAddress: await getRequestIpAddress(),
  });

  revalidateSafetyPaths(profileId);
}

export async function reviewSafetyConcernProfile(
  profileId: string,
  _prev: SafetyConcernActionState,
  formData: FormData,
): Promise<SafetyConcernActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    await requireSafetyConcernWrite({
      churchId: church.id,
      role: membership.role,
    });

    const existing = await getSafetyConcernProfile(church.id, profileId);
    if (!existing) return { error: "Profile not found." };

    const outcomeRaw = String(formData.get("outcome") ?? "").trim();
    if (
      !SAFETY_CONCERN_REVIEW_OUTCOMES.some((item) => item.value === outcomeRaw)
    ) {
      return { fieldErrors: { outcome: "Select a valid review outcome." } };
    }

    const settings = await getSafetyConcernChurchSettings(church.id);
    const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
    const customNext = String(formData.get("new_next_review_date") ?? "").trim();
    const newNext =
      customNext && /^\d{4}-\d{2}-\d{2}$/.test(customNext)
        ? customNext
        : addDaysIso(settings.review_interval_days);

    let nextStatus = existing.profile_status;
    if (outcomeRaw === "archived") nextStatus = "archived";
    else if (outcomeRaw === "expired") nextStatus = "expired";
    else if (outcomeRaw === "confirmed_active" || outcomeRaw === "updated") {
      nextStatus = "active";
    } else if (outcomeRaw === "needs_follow_up") {
      nextStatus = "under_review";
    }

    if (
      nextStatus === "active" &&
      existing.profile_status !== "active"
    ) {
      const blockers = await getSafetyConcernActivationBlockers({
        churchId: church.id,
        profileId,
        settings,
        client: supabase,
      });
      if (blockers.length > 0) {
        return { error: blockers[0] };
      }
    }

    const { data: review, error: reviewError } = await supabase
      .from("safety_concern_reviews")
      .insert({
        organization_id: church.id,
        profile_id: profileId,
        reviewed_by: user.id,
        outcome: outcomeRaw,
        notes,
        previous_next_review_date: existing.next_review_date,
        new_next_review_date: newNext,
      })
      .select("id")
      .single();

    if (reviewError || !review) {
      return { error: reviewError?.message || "Unable to save review." };
    }

    const { error } = await supabase
      .from("safety_concern_profiles")
      .update({
        profile_status: nextStatus,
        reviewed_by: user.id,
        last_reviewed_at: new Date().toISOString(),
        next_review_date: newNext,
        updated_by: user.id,
        archived_at:
          nextStatus === "archived" ? new Date().toISOString() : null,
        archived_by: nextStatus === "archived" ? user.id : null,
      })
      .eq("id", profileId)
      .eq("organization_id", church.id);

    if (error) return { error: error.message };

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.SAFETY_CONCERN_REVIEW_COMPLETED,
      entityType: AuditEntityType.SAFETY_CONCERN_REVIEW,
      entityId: review.id,
      metadata: {
        profile_id: profileId,
        outcome: outcomeRaw,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateSafetyPaths(profileId);
    return { success: true };
  } catch (error) {
    return {
      error: isEntitlementError(error)
        ? entitlementErrorMessage(error)
        : error instanceof Error
          ? error.message
          : "Failed to complete review.",
    };
  }
}

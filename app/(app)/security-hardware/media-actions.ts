"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTACHMENT_KINDS,
  RELATIONSHIP_TYPES,
  type EquipmentAttachmentKind,
  type EquipmentRelationshipType,
  type MediaActionState,
} from "@/lib/security-hardware/attachments";
import {
  EQUIPMENT_ATTACHMENT_MAX_COUNT,
  EQUIPMENT_MEDIA_BUCKET,
  collectAttachmentFiles,
  defaultKindForMime,
  equipmentAttachmentObjectPath,
  isEquipmentMediaStoragePath,
  validateEquipmentAttachmentFile,
} from "@/lib/security-hardware/attachment-storage";
import {
  getOperationalChurchContext,
  getSecurityEquipmentById,
} from "@/lib/security-hardware/queries";
import {
  canManageSecurityEquipment,
  canOperateSecurityEquipment,
} from "@/lib/security-hardware/types";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { requireFeature } from "@/lib/subscriptions/resolver";

function text(formData: FormData, key: string, max = 2000): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  return value.slice(0, max);
}

function revalidateEquipment(equipmentId: string) {
  revalidatePath("/security-hardware");
  revalidatePath(`/security-hardware/${equipmentId}`);
  revalidatePath("/security-hardware/reports");
}

async function countAttachments(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("equipment_attachments")
    .select("id", { count: "exact", head: true })
    .eq("equipment_id", equipmentId);
  if (error) {
    if (
      error.message.includes("equipment_attachments") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      throw new Error(
        "Run supabase/migrations/022_security_equipment.sql in the Supabase SQL Editor to enable attachments.",
      );
    }
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function uploadEquipmentAttachments(
  equipmentId: string,
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canOperateSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to upload attachments." };
    }

    await requireFeature({
      churchId: church.id,
      featureKey: FEATURE_KEYS.HARDWARE_INVENTORY,
    });

    const equipment = await getSecurityEquipmentById(equipmentId, church.id);
    if (!equipment) return { error: "Equipment not found." };

    const kindRaw = text(formData, "kind", 40);
    const kind: EquipmentAttachmentKind | null = kindRaw
      ? ATTACHMENT_KINDS.some((item) => item.value === kindRaw)
        ? (kindRaw as EquipmentAttachmentKind)
        : null
      : null;

    if (kindRaw && !kind) {
      return { fieldErrors: { kind: "Select a valid document type." } };
    }

    const files = collectAttachmentFiles(formData);
    if (files.length === 0) {
      return { fieldErrors: { files: "Choose at least one file to upload." } };
    }

    const includesPhoto = files.some((file) =>
      file.type.startsWith("image/"),
    ) || kind === "photo";
    if (includesPhoto) {
      await requireFeature({
        churchId: church.id,
        featureKey: FEATURE_KEYS.HARDWARE_PHOTOS,
      });
    }

    const existing = await countAttachments(supabase, equipmentId);
    if (existing + files.length > EQUIPMENT_ATTACHMENT_MAX_COUNT) {
      return {
        error: `Equipment can have at most ${EQUIPMENT_ATTACHMENT_MAX_COUNT} attachments (${existing} already attached).`,
        fieldErrors: { files: "Too many files for this equipment item." },
      };
    }

    for (const file of files) {
      const fileError = validateEquipmentAttachmentFile(file);
      if (fileError) {
        return { error: fileError, fieldErrors: { files: fileError } };
      }
    }

    let uploaded = 0;

    for (const file of files) {
      const resolvedKind = kind ?? defaultKindForMime(file.type);
      const objectPath = equipmentAttachmentObjectPath({
        churchId: church.id,
        equipmentId,
        kind: resolvedKind,
        mimeType: file.type,
      });

      if (!objectPath) {
        return { error: "Unsupported file type." };
      }

      const { error: uploadError } = await supabase.storage
        .from(EQUIPMENT_MEDIA_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return {
          error:
            uploadError.message.includes("Bucket not found") ||
            uploadError.message.includes("not found")
              ? "Run supabase/migrations/022_security_equipment.sql in the Supabase SQL Editor to enable attachments."
              : uploadError.message || "Unable to upload file.",
        };
      }

      const { data: row, error: insertError } = await supabase
        .from("equipment_attachments")
        .insert({
          church_id: church.id,
          equipment_id: equipmentId,
          kind: resolvedKind,
          storage_path: objectPath,
          mime_type: file.type,
          byte_size: file.size,
          original_filename: file.name?.slice(0, 255) || null,
          uploaded_by: user.id,
        })
        .select("id")
        .single();

      if (insertError || !row) {
        await supabase.storage
          .from(EQUIPMENT_MEDIA_BUCKET)
          .remove([objectPath]);
        return {
          error:
            insertError?.message ||
            "Unable to save attachment metadata. Confirm migration 022 has been applied.",
        };
      }

      uploaded += 1;

      await writeAuditLog(supabase, {
        churchId: church.id,
        userId: user.id,
        action: AuditAction.EQUIPMENT_ATTACHMENT_UPLOADED,
        entityType: AuditEntityType.EQUIPMENT_ATTACHMENT,
        entityId: row.id,
        metadata: {
          equipment_id: equipmentId,
          kind: resolvedKind,
          storage_path: objectPath,
          mime_type: file.type,
          byte_size: file.size,
        },
        ipAddress: await getRequestIpAddress(),
      });
    }

    revalidateEquipment(equipmentId);
    return { success: true, error: uploaded > 0 ? null : "Nothing uploaded." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to upload attachments.",
    };
  }
}

export async function deleteEquipmentAttachment(
  attachmentId: string,
): Promise<MediaActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canOperateSecurityEquipment(membership.role)) {
      return { error: "You do not have permission to remove attachments." };
    }

    const { data: attachment, error } = await supabase
      .from("equipment_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (error || !attachment) {
      return { error: error?.message || "Attachment not found." };
    }

    const canDelete =
      canManageSecurityEquipment(membership.role) ||
      attachment.uploaded_by === user.id;
    if (!canDelete) {
      return { error: "You can only remove attachments you uploaded." };
    }

    if (
      !isEquipmentMediaStoragePath(
        attachment.storage_path,
        church.id,
        attachment.equipment_id,
      )
    ) {
      return { error: "Invalid attachment storage path." };
    }

    const { error: deleteRowError } = await supabase
      .from("equipment_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("church_id", church.id);

    if (deleteRowError) {
      return { error: deleteRowError.message };
    }

    await supabase.storage
      .from(EQUIPMENT_MEDIA_BUCKET)
      .remove([attachment.storage_path]);

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_ATTACHMENT_REMOVED,
      entityType: AuditEntityType.EQUIPMENT_ATTACHMENT,
      entityId: attachmentId,
      metadata: {
        equipment_id: attachment.equipment_id,
        storage_path: attachment.storage_path,
        kind: attachment.kind,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(attachment.equipment_id);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove attachment.",
    };
  }
}

export async function addEquipmentRelationship(
  equipmentId: string,
  _prev: MediaActionState,
  formData: FormData,
): Promise<MediaActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return { error: "Only security leaders can manage relationships." };
    }

    const equipment = await getSecurityEquipmentById(equipmentId, church.id);
    if (!equipment) return { error: "Equipment not found." };

    const relatedId = text(formData, "related_equipment_id", 64);
    const typeRaw = text(formData, "relationship_type", 40) ?? "other";
    const notes = text(formData, "notes", 2000);
    const direction = text(formData, "direction", 16) ?? "outbound";

    if (!relatedId) {
      return {
        fieldErrors: { related_equipment_id: "Select related equipment." },
      };
    }

    if (relatedId === equipmentId) {
      return {
        fieldErrors: {
          related_equipment_id: "Equipment cannot relate to itself.",
        },
      };
    }

    if (!RELATIONSHIP_TYPES.some((item) => item.value === typeRaw)) {
      return {
        fieldErrors: { relationship_type: "Select a valid relationship type." },
      };
    }

    const related = await getSecurityEquipmentById(relatedId, church.id);
    if (!related) {
      return {
        fieldErrors: { related_equipment_id: "Related equipment not found." },
      };
    }

    const parentId = direction === "inbound" ? relatedId : equipmentId;
    const childId = direction === "inbound" ? equipmentId : relatedId;

    const { data, error } = await supabase
      .from("equipment_relationships")
      .insert({
        church_id: church.id,
        parent_equipment_id: parentId,
        child_equipment_id: childId,
        relationship_type: typeRaw as EquipmentRelationshipType,
        notes,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        return { error: "That relationship already exists." };
      }
      return {
        error:
          error?.message ||
          "Unable to add relationship. Confirm migration 022 has been applied.",
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_RELATIONSHIP_ADDED,
      entityType: AuditEntityType.EQUIPMENT_RELATIONSHIP,
      entityId: data.id,
      metadata: {
        parent_equipment_id: parentId,
        child_equipment_id: childId,
        relationship_type: typeRaw,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(equipmentId);
    revalidatePath(`/security-hardware/${relatedId}`);
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to add relationship.",
    };
  }
}

export async function removeEquipmentRelationship(
  relationshipId: string,
  equipmentId: string,
): Promise<MediaActionState> {
  try {
    const { supabase, user, church, membership } =
      await getOperationalChurchContext();

    if (!canManageSecurityEquipment(membership.role)) {
      return { error: "Only security leaders can manage relationships." };
    }

    const { data: relationship, error } = await supabase
      .from("equipment_relationships")
      .select("*")
      .eq("id", relationshipId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (error || !relationship) {
      return { error: error?.message || "Relationship not found." };
    }

    const { error: deleteError } = await supabase
      .from("equipment_relationships")
      .delete()
      .eq("id", relationshipId)
      .eq("church_id", church.id);

    if (deleteError) {
      return { error: deleteError.message };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.EQUIPMENT_RELATIONSHIP_REMOVED,
      entityType: AuditEntityType.EQUIPMENT_RELATIONSHIP,
      entityId: relationshipId,
      metadata: {
        parent_equipment_id: relationship.parent_equipment_id,
        child_equipment_id: relationship.child_equipment_id,
        relationship_type: relationship.relationship_type,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateEquipment(equipmentId);
    revalidatePath(
      `/security-hardware/${relationship.parent_equipment_id}`,
    );
    revalidatePath(
      `/security-hardware/${relationship.child_equipment_id}`,
    );
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove relationship.",
    };
  }
}

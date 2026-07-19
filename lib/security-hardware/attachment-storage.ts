import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EquipmentAttachmentKind } from "@/lib/security-hardware/attachments";

export const EQUIPMENT_MEDIA_BUCKET = "equipment-media";
/** General attachments (docs + photos) on the equipment detail card. */
export const EQUIPMENT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const EQUIPMENT_ATTACHMENT_MAX_COUNT = 20;
/** Photos attached when creating/editing equipment from the form. */
export const EQUIPMENT_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const EQUIPMENT_PHOTO_MAX_COUNT = 5;
export const EQUIPMENT_SIGNED_URL_SECONDS = 60 * 60;

export const EQUIPMENT_ATTACHMENT_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export const EQUIPMENT_PHOTO_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function extensionForEquipmentAttachmentMime(
  mimeType: string,
): string | null {
  if (!EQUIPMENT_ATTACHMENT_ALLOWED_MIME.has(mimeType)) return null;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "application/pdf") return "pdf";
  return "jpg";
}

export function equipmentAttachmentObjectPath(params: {
  churchId: string;
  equipmentId: string;
  kind: EquipmentAttachmentKind;
  mimeType: string;
}): string | null {
  const ext = extensionForEquipmentAttachmentMime(params.mimeType);
  if (!ext) return null;
  return `churches/${params.churchId}/equipment/${params.equipmentId}/${params.kind}/${randomUUID()}.${ext}`;
}

export function isEquipmentMediaStoragePath(
  path: string,
  churchId: string,
  equipmentId?: string,
): boolean {
  const prefix = `churches/${churchId}/equipment/`;
  if (!path.startsWith(prefix)) return false;
  if (!equipmentId) return true;
  return path.startsWith(`${prefix}${equipmentId}/`);
}

export function collectAttachmentFiles(formData: FormData): File[] {
  const fromFiles = formData.getAll("files");
  const fromFile = formData.getAll("file");
  const files: File[] = [];
  for (const entry of [...fromFiles, ...fromFile]) {
    if (entry instanceof File && entry.size > 0) {
      files.push(entry);
    }
  }
  return files;
}

export function collectEquipmentPhotoFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const entry of formData.getAll("photos")) {
    if (entry instanceof File && entry.size > 0) {
      files.push(entry);
    }
  }
  return files;
}

export function validateEquipmentAttachmentFile(file: File): string | null {
  if (!EQUIPMENT_ATTACHMENT_ALLOWED_MIME.has(file.type)) {
    return "Use PNG, JPEG, WebP, GIF, or PDF files.";
  }
  if (file.size > EQUIPMENT_ATTACHMENT_MAX_BYTES) {
    return "Each file must be 15 MB or smaller.";
  }
  return null;
}

export function validateEquipmentPhotoFile(file: File): string | null {
  if (!EQUIPMENT_PHOTO_ALLOWED_MIME.has(file.type)) {
    return "Photos must be PNG, JPEG, WebP, or GIF.";
  }
  if (file.size > EQUIPMENT_PHOTO_MAX_BYTES) {
    return "Each photo must be 15 MB or smaller.";
  }
  return null;
}

export function defaultKindForMime(mimeType: string): EquipmentAttachmentKind {
  return mimeType.startsWith("image/") ? "photo" : "other";
}

export async function uploadEquipmentPhotoFiles(params: {
  supabase: SupabaseClient;
  churchId: string;
  equipmentId: string;
  userId: string;
  files: File[];
}): Promise<{ uploaded: number; error?: string }> {
  const { supabase, churchId, equipmentId, userId, files } = params;
  let uploaded = 0;

  for (const file of files) {
    const objectPath = equipmentAttachmentObjectPath({
      churchId,
      equipmentId,
      kind: "photo",
      mimeType: file.type,
    });

    if (!objectPath) {
      return { uploaded, error: "Unsupported photo type." };
    }

    const { error: uploadError } = await supabase.storage
      .from(EQUIPMENT_MEDIA_BUCKET)
      .upload(objectPath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        uploaded,
        error:
          uploadError.message.includes("Bucket not found") ||
          uploadError.message.includes("not found")
            ? "Run supabase/migrations/022_security_equipment.sql (and 031_equipment_media_15mb.sql) to enable photo storage."
            : uploadError.message || "Unable to upload photo.",
      };
    }

    const { error: insertError } = await supabase
      .from("equipment_attachments")
      .insert({
        church_id: churchId,
        equipment_id: equipmentId,
        kind: "photo",
        storage_path: objectPath,
        mime_type: file.type,
        byte_size: file.size,
        original_filename: file.name.slice(0, 255),
        uploaded_by: userId,
      });

    if (insertError) {
      await supabase.storage.from(EQUIPMENT_MEDIA_BUCKET).remove([objectPath]);
      return {
        uploaded,
        error:
          insertError.message.includes("equipment_attachments") ||
          insertError.code === "42P01" ||
          insertError.code === "PGRST205"
            ? "Run supabase/migrations/022_security_equipment.sql to enable attachments."
            : insertError.message || "Unable to save photo record.",
      };
    }

    uploaded += 1;
  }

  return { uploaded };
}

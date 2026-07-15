import { randomUUID } from "crypto";
import type { EquipmentAttachmentKind } from "@/lib/security-hardware/attachments";

export const EQUIPMENT_MEDIA_BUCKET = "equipment-media";
export const EQUIPMENT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const EQUIPMENT_ATTACHMENT_MAX_COUNT = 20;
export const EQUIPMENT_SIGNED_URL_SECONDS = 60 * 60;

export const EQUIPMENT_ATTACHMENT_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
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

export function validateEquipmentAttachmentFile(file: File): string | null {
  if (!EQUIPMENT_ATTACHMENT_ALLOWED_MIME.has(file.type)) {
    return "Use PNG, JPEG, WebP, GIF, or PDF files.";
  }
  if (file.size > EQUIPMENT_ATTACHMENT_MAX_BYTES) {
    return "Each file must be 10 MB or smaller.";
  }
  return null;
}

export function defaultKindForMime(mimeType: string): EquipmentAttachmentKind {
  return mimeType.startsWith("image/") ? "photo" : "other";
}

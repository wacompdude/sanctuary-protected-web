import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const POLICY_MEDIA_BUCKET = "policy-media";
export const POLICY_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const POLICY_ATTACHMENT_MAX_COUNT = 20;
export const POLICY_SIGNED_URL_SECONDS = 60 * 60;

export const POLICY_ATTACHMENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function extensionForPolicyAttachmentMime(
  mimeType: string,
): string | null {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/vnd.ms-excel":
      return "xls";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      return null;
  }
}

/** Prefer browser MIME; fall back to filename extension (common for Word on Windows). */
export function resolvePolicyAttachmentMime(file: {
  type?: string;
  name?: string;
}): string | null {
  const declared = (file.type ?? "").trim().toLowerCase();
  if (declared && POLICY_ATTACHMENT_ALLOWED_MIME.has(declared)) {
    return declared;
  }

  const name = file.name ?? "";
  const ext = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const fromExt = EXTENSION_TO_MIME[ext] ?? null;
  if (fromExt) return fromExt;

  if (declared && declared !== "application/octet-stream") {
    return null;
  }
  return null;
}

export function policyAttachmentObjectPath(params: {
  churchId: string;
  policyId: string;
  versionId: string;
  mimeType: string;
}): string | null {
  const ext = extensionForPolicyAttachmentMime(params.mimeType);
  if (!ext) return null;
  return `churches/${params.churchId}/policies/${params.policyId}/versions/${params.versionId}/attachments/${randomUUID()}.${ext}`;
}

export function isPolicyMediaStoragePath(
  path: string,
  churchId: string,
  policyId?: string,
): boolean {
  const prefix = `churches/${churchId}/policies/`;
  if (!path.startsWith(prefix)) return false;
  if (!policyId) return true;
  return path.startsWith(`${prefix}${policyId}/`);
}

export function collectPolicyAttachmentFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const entry of [
    ...formData.getAll("files"),
    ...formData.getAll("file"),
    ...formData.getAll("attachments"),
  ]) {
    if (entry instanceof File && entry.size > 0) {
      files.push(entry);
    }
  }
  return files;
}

export function validatePolicyAttachmentFile(file: File): string | null {
  const mime = resolvePolicyAttachmentMime(file);
  if (!mime) {
    return "Use PDF or Word documents (.pdf, .doc, .docx). Excel and images are also allowed.";
  }
  if (file.size > POLICY_ATTACHMENT_MAX_BYTES) {
    return "Each file must be 15 MB or smaller.";
  }
  return null;
}

export function defaultPolicyAttachmentType(
  mimeType: string,
): "supporting" | "image" | "form" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "form";
  return "supporting";
}

export async function uploadPolicyAttachmentFiles(params: {
  supabase: SupabaseClient;
  churchId: string;
  policyId: string;
  versionId: string;
  userId: string;
  files: File[];
  attachmentType?: "supporting" | "form" | "checklist" | "image" | "reference" | "other";
}): Promise<{ uploaded: number; error?: string }> {
  const {
    supabase,
    churchId,
    policyId,
    versionId,
    userId,
    files,
    attachmentType,
  } = params;

  let uploaded = 0;

  for (const file of files) {
    const mimeType = resolvePolicyAttachmentMime(file);
    if (!mimeType) {
      return {
        uploaded,
        error:
          "Use PDF or Word documents (.pdf, .doc, .docx). Excel and images are also allowed.",
      };
    }

    const sizeError = validatePolicyAttachmentFile(file);
    if (sizeError && sizeError.includes("15 MB")) {
      return { uploaded, error: sizeError };
    }

    const objectPath = policyAttachmentObjectPath({
      churchId,
      policyId,
      versionId,
      mimeType,
    });
    if (!objectPath) {
      return { uploaded, error: "Unsupported file type." };
    }

    const resolvedType = attachmentType ?? defaultPolicyAttachmentType(mimeType);

    const { error: uploadError } = await supabase.storage
      .from(POLICY_MEDIA_BUCKET)
      .upload(objectPath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return {
        uploaded,
        error:
          uploadError.message.includes("Bucket not found") ||
          uploadError.message.includes("not found")
            ? "Run supabase/migrations/033_policy_management.sql to enable policy attachments."
            : uploadError.message || "Unable to upload file.",
      };
    }

    const { data: row, error: insertError } = await supabase
      .from("policy_attachments")
      .insert({
        church_id: churchId,
        policy_document_id: policyId,
        policy_version_id: versionId,
        file_name: file.name?.slice(0, 255) || "attachment",
        storage_path: objectPath,
        mime_type: mimeType,
        size_bytes: file.size,
        attachment_type: resolvedType,
        uploaded_by: userId,
      })
      .select("id")
      .single();

    if (insertError || !row) {
      await supabase.storage.from(POLICY_MEDIA_BUCKET).remove([objectPath]);
      return {
        uploaded,
        error:
          insertError?.message || "Unable to save attachment metadata.",
      };
    }

    uploaded += 1;
  }

  return { uploaded };
}

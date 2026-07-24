import { randomUUID } from "crypto";

export const INCIDENT_MEDIA_BUCKET = "incident-media";
/** Fallback defaults when entitlements are unavailable — prefer plan limits. */
export const INCIDENT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const INCIDENT_PHOTO_MAX_COUNT = 2;
export const INCIDENT_SIGNED_URL_SECONDS = 60 * 60;

export const INCIDENT_PHOTO_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function extensionForIncidentPhotoMime(mimeType: string): string | null {
  if (!INCIDENT_PHOTO_ALLOWED_MIME.has(mimeType)) return null;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

export function incidentPhotoObjectPath(params: {
  churchId: string;
  incidentId: string;
  mimeType: string;
}): string | null {
  const ext = extensionForIncidentPhotoMime(params.mimeType);
  if (!ext) return null;
  return `churches/${params.churchId}/incidents/${params.incidentId}/${randomUUID()}.${ext}`;
}

export function isIncidentMediaStoragePath(
  path: string,
  churchId: string,
  incidentId?: string,
): boolean {
  const prefix = `churches/${churchId}/incidents/`;
  if (!path.startsWith(prefix)) return false;
  if (!incidentId) return true;
  return path.startsWith(`${prefix}${incidentId}/`);
}

export function collectPhotoFiles(formData: FormData): File[] {
  const fromPhotos = formData.getAll("photos");
  const fromSingular = formData.getAll("photo");
  const files: File[] = [];
  for (const entry of [...fromPhotos, ...fromSingular]) {
    if (entry instanceof File && entry.size > 0) {
      files.push(entry);
    }
  }
  return files;
}

export function validateIncidentPhotoFile(
  file: File,
  maxBytes: number = INCIDENT_PHOTO_MAX_BYTES,
): string | null {
  if (!INCIDENT_PHOTO_ALLOWED_MIME.has(file.type)) {
    return "Use PNG, JPEG, WebP, or GIF images.";
  }
  if (file.size > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return `Each photo must be ${mb} MB or smaller.`;
  }
  return null;
}

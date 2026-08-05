export const SAFETY_CONCERN_MEDIA_BUCKET = "safety-concern-photos";

/** Works in Node 19+ and React Native / Expo (global crypto). */
function newPhotoObjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Fallback defaults — prefer plan entitlements at call sites. */
export const SAFETY_CONCERN_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const SAFETY_CONCERN_PHOTO_MAX_COUNT = 3;

/**
 * Short-lived signed URLs for sensitive photos.
 * Prefer regenerating per view over long browser caching.
 */
export const SAFETY_CONCERN_SIGNED_URL_SECONDS = 15 * 60;

export const SAFETY_CONCERN_PHOTO_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * EXIF / metadata policy (Phase 4):
 * - We do not currently re-encode images server-side.
 * - Upload validation checks declared MIME + magic bytes.
 * - Geolocation / EXIF stripping is deferred until an image pipeline exists.
 * - Do not log storage paths with filenames that include personal names
 *   (paths use UUIDs only).
 */
export const SAFETY_CONCERN_EXIF_POLICY =
  "validate-mime-and-magic-bytes; no-server-side-exif-strip-yet";

export function extensionForSafetyConcernPhotoMime(
  mimeType: string,
): string | null {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  return null;
}

/** Path: churches/{organizationId}/safety-concerns/{profileId}/{uuid}.{ext} */
export function safetyConcernPhotoObjectPath(params: {
  organizationId: string;
  profileId: string;
  mimeType: string;
}): string | null {
  const ext = extensionForSafetyConcernPhotoMime(params.mimeType);
  if (!ext) return null;
  return `churches/${params.organizationId}/safety-concerns/${params.profileId}/${newPhotoObjectId()}.${ext}`;
}

export function isSafetyConcernPhotoStoragePath(
  path: string,
  organizationId: string,
  profileId?: string,
): boolean {
  const prefix = `churches/${organizationId}/safety-concerns/`;
  if (!path.startsWith(prefix)) return false;
  if (!profileId) return true;
  return path.startsWith(`${prefix}${profileId}/`);
}

export function collectSafetyConcernPhotoFiles(formData: FormData): File[] {
  const files: File[] = [];
  for (const entry of [
    ...formData.getAll("photos"),
    ...formData.getAll("photo"),
  ]) {
    if (entry instanceof File && entry.size > 0) {
      files.push(entry);
    }
  }
  return files;
}

export function validateSafetyConcernPhotoFile(
  file: File,
  maxBytes: number = SAFETY_CONCERN_PHOTO_MAX_BYTES,
): string | null {
  if (!SAFETY_CONCERN_PHOTO_ALLOWED_MIME.has(file.type)) {
    return "Use JPEG, PNG, or WebP images.";
  }
  if (file.size > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return `Each photo must be ${mb} MB or smaller.`;
  }
  return null;
}

/** Detect image MIME from file signature (do not trust extensions alone). */
export function sniffImageMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function validateSafetyConcernPhotoBytes(params: {
  file: File;
  maxBytes?: number;
}): Promise<{ ok: true; mimeType: string } | { ok: false; error: string }> {
  const maxBytes = params.maxBytes ?? SAFETY_CONCERN_PHOTO_MAX_BYTES;
  const declaredError = validateSafetyConcernPhotoFile(params.file, maxBytes);
  if (declaredError) return { ok: false, error: declaredError };

  const header = new Uint8Array(await params.file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageMimeFromBytes(header);
  if (!sniffed || !SAFETY_CONCERN_PHOTO_ALLOWED_MIME.has(sniffed)) {
    return {
      ok: false,
      error: "File contents are not a valid JPEG, PNG, or WebP image.",
    };
  }
  if (params.file.type && params.file.type !== sniffed) {
    return {
      ok: false,
      error: "File type does not match the image contents.",
    };
  }
  return { ok: true, mimeType: sniffed };
}

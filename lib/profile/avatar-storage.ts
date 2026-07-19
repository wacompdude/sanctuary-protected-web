import { getSupabaseUrl } from "@/lib/supabase/env";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function extensionForAvatarMime(mimeType: string): string | null {
  if (!AVATAR_ALLOWED_MIME.has(mimeType)) return null;
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "jpg";
}

export function profileAvatarObjectPath(
  userId: string,
  mimeType: string,
): string | null {
  const ext = extensionForAvatarMime(mimeType);
  if (!ext) return null;
  return `users/${userId}/avatar.${ext}`;
}

export function isProfileAvatarStoragePath(
  path: string,
  userId: string,
): boolean {
  return path.startsWith(`users/${userId}/`);
}

export function publicUrlForAvatarPath(
  avatarPath: string | null | undefined,
): string | null {
  if (!avatarPath) return null;
  if (avatarPath.includes("://")) return avatarPath;
  const base = getSupabaseUrl().replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${avatarPath.replace(/^\//, "")}`;
}

export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_ALLOWED_MIME.has(file.type)) {
    return "Use a PNG, JPEG, WebP, or GIF image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "Photo must be 5 MB or smaller.";
  }
  return null;
}

export function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

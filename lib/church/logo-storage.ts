import { getSupabaseUrl } from "@/lib/supabase/env";

export const CHURCH_BRANDING_BUCKET = "church-branding";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export const LOGO_MAX_DIMENSION = 4096;

export function churchLogoObjectPath(
  churchId: string,
  mimeType: string,
): string {
  const ext =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/gif"
          ? "gif"
          : "jpg";
  return `churches/${churchId}/branding/logo.${ext}`;
}

export function isChurchBrandingStoragePath(
  path: string,
  churchId: string,
): boolean {
  return path.startsWith(`churches/${churchId}/branding/`);
}

export function publicUrlForLogoPath(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  if (logoPath.includes("://")) return logoPath;
  const base = getSupabaseUrl().replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${CHURCH_BRANDING_BUCKET}/${logoPath.replace(/^\//, "")}`;
}

export function extensionForMime(mimeType: string): string | null {
  if (!LOGO_ALLOWED_MIME.has(mimeType)) return null;
  return mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
      ? "webp"
      : mimeType === "image/gif"
        ? "gif"
        : "jpg";
}

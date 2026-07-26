/**
 * Help Center asset storage conventions (private bucket).
 * Safe for mobile — no Next.js imports.
 */

export const HELP_CENTER_ASSETS_BUCKET = "help-center-assets";

/** Prefer regenerating per view; do not persist to disk cache. */
export const HELP_ASSET_SIGNED_URL_SECONDS = 15 * 60;

export const HELP_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export const HELP_ASSET_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function extensionForHelpAssetMime(mimeType: string): string | null {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/gif") return "gif";
  return null;
}

/**
 * Expected object path shapes:
 * - articles/{articleId}/{uuid}.{ext}
 * - steps/{articleId}/{uuid}.{ext}
 */
export function isHelpAssetStoragePath(
  path: string,
  articleId?: string,
): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) {
    return false;
  }

  const articlePrefix = articleId ? `articles/${articleId}/` : "articles/";
  const stepPrefix = articleId ? `steps/${articleId}/` : "steps/";

  if (articleId) {
    return (
      trimmed.startsWith(articlePrefix) || trimmed.startsWith(stepPrefix)
    );
  }

  return (
    /^articles\/[0-9a-f-]{36}\//i.test(trimmed) ||
    /^steps\/[0-9a-f-]{36}\//i.test(trimmed)
  );
}

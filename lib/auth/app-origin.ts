/**
 * Canonical public origin for auth redirects and invitation links.
 * Prefer NEXT_PUBLIC_APP_URL / APP_BASE_URL in production so emails never
 * fall back to localhost when Supabase Site URL is misconfigured.
 */
export function getPublicAppOrigin(): string {
  const fromAppBase = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (fromAppBase) return fromAppBase;

  const fromPublic = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromPublic) return fromPublic;

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercel) {
    return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  }

  return "http://localhost:3000";
}

export function buildAuthConfirmUrl(nextPath = "/home"): string {
  const origin = getPublicAppOrigin();
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

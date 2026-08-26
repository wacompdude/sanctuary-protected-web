/**
 * Allowlisted internal deep-link prefixes for Help Center steps/CTAs.
 * Paths must be app-relative (start with `/`). Mobile apps map these later.
 */

export const HELP_DEEP_LINK_ALLOWED_PREFIXES = [
  "/help",
  "/dashboard",
  "/home",
  "/events",
  "/schedule",
  "/incidents",
  "/team",
  "/notification-groups",
  "/notifications",
  "/medical-supplies",
  "/security-hardware",
  "/policies",
  "/safety-concerns",
  "/campuses",
  "/cameras",
  "/sensors",
  "/certifications",
  "/training",
  "/settings",
  "/profile",
  "/audit",
  "/churches",
  "/select-church",
] as const;

const INTERNAL_PATH_RE = /^\/[a-zA-Z0-9/_?=&%#.-]*$/;

export function isHelpDeepLinkPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (!INTERNAL_PATH_RE.test(trimmed)) return false;
  if (/javascript:/i.test(trimmed)) return false;
  if (/data:/i.test(trimmed)) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("://")) return false;

  const pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
  return HELP_DEEP_LINK_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function normalizeHelpDeepLinkPath(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return isHelpDeepLinkPath(trimmed) ? trimmed : null;
}

/** Expo / native route translation hint (web path → logical screen id). */
export function helpDeepLinkScreenHint(path: string): string {
  const pathname = path.split(/[?#]/)[0] ?? path;
  const parts = pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts.join(".") : "home";
}

export type HelpMobileDeepLink = {
  /** Original allowlisted app-relative path (includes query/hash when present). */
  path: string;
  /** Pathname without query/hash. */
  pathname: string;
  /** Dot-separated screen id hint for Expo route maps. */
  screen_hint: string;
  /** Parsed query params (empty object when none). */
  query: Record<string, string>;
  allowed: true;
};

/**
 * Translate an allowlisted Help deep link into a mobile-friendly structure.
 * Returns null when the path is missing or not allowlisted.
 */
export function translateHelpDeepLinkForMobile(
  path: string | null | undefined,
): HelpMobileDeepLink | null {
  const normalized = normalizeHelpDeepLinkPath(path);
  if (!normalized) return null;

  const [pathnamePart, queryPart] = normalized.split("?", 2);
  const pathname = (pathnamePart ?? normalized).split("#")[0] ?? normalized;
  const query: Record<string, string> = {};
  if (queryPart) {
    const search = queryPart.split("#")[0] ?? queryPart;
    for (const pair of search.split("&")) {
      if (!pair) continue;
      const [rawKey, rawValue = ""] = pair.split("=", 2);
      const key = decodeURIComponent(rawKey ?? "").trim();
      if (!key) continue;
      query[key] = decodeURIComponent(rawValue);
    }
  }

  return {
    path: normalized,
    pathname,
    screen_hint: helpDeepLinkScreenHint(pathname),
    query,
    allowed: true,
  };
}

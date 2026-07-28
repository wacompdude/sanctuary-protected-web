/** Routes accessible without authentication. */
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/auth/sign-up",
  "/auth/sign-up-success",
  "/auth/forgot-password",
  "/auth/update-password",
  "/auth/error",
  "/auth/confirm",
  "/platform/invitations/accept",
];

/** Path prefixes that remain public (e.g. email confirmation callbacks). */
export const PUBLIC_PATH_PREFIXES = ["/auth", "/api"];

/**
 * Provider webhooks — must never redirect to HTML login (that turns POST into
 * a 405 on /login). Kept explicit even though /api is already public.
 */
export const WEBHOOK_PATH_PREFIXES = [
  "/api/notifications/webhooks",
  "/api/billing/webhooks",
];

/** Auth entry pages — signed-in users are redirected to the dashboard. */
export const AUTH_ENTRY_PATHS = [
  "/login",
  "/register",
  "/auth/login",
  "/auth/sign-up",
  "/auth/forgot-password",
];

/** App routes that require authentication. */
export const PROTECTED_PATH_PREFIXES = [
  "/home",
  "/dashboard",
  "/notifications",
  "/notification-groups",
  "/incidents",
  "/events",
  "/certifications",
  "/training",
  "/team",
  "/campuses",
  "/security-hardware",
  "/medical-supplies",
  "/policies",
  "/schedule",
  "/cameras",
  "/sensors",
  "/audit",
  "/settings",
  "/select-church",
  "/churches",
  "/profile",
  "/help",
  "/onboarding",
  "/invitations",
  "/protected",
  "/platform",
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (isWebhookPath(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isWebhookPath(pathname: string): boolean {
  return WEBHOOK_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isProtectedPath(pathname: string): boolean {
  if (pathname === "/platform/invitations/accept") return false;
  if (isWebhookPath(pathname)) return false;
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.includes(pathname);
}

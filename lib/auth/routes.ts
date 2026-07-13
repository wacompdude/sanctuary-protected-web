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
];

/** Path prefixes that remain public (e.g. email confirmation callbacks). */
export const PUBLIC_PATH_PREFIXES = ["/auth"];

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
  "/dashboard",
  "/incidents",
  "/events",
  "/certifications",
  "/team",
  "/campuses",
  "/cameras",
  "/sensors",
  "/audit",
  "/settings",
  "/select-church",
  "/churches",
  "/profile",
  "/onboarding",
  "/invitations",
  "/protected",
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthEntryPath(pathname: string): boolean {
  return AUTH_ENTRY_PATHS.includes(pathname);
}

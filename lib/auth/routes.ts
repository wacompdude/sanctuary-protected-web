/** Routes accessible without authentication. */
export const PUBLIC_PATHS = ["/", "/login"];

/** Path prefixes that remain public (e.g. starter auth flows). */
export const PUBLIC_PATH_PREFIXES = ["/auth"];

/** App routes that require authentication. */
export const PROTECTED_PATH_PREFIXES = [
  "/dashboard",
  "/incidents",
  "/events",
  "/certifications",
  "/team",
  "/cameras",
  "/sensors",
  "/protected",
];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

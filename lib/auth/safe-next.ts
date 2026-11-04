/**
 * Same-origin relative path sanitization for auth redirects.
 * Rejects protocol-relative, absolute, and empty destinations.
 */
export function isSafeRelativeNextPath(path: string | null | undefined): boolean {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("://")) return false;
  return true;
}

export function safeAuthNextPath(
  path: string | null | undefined,
  fallback = "/home",
): string {
  return isSafeRelativeNextPath(path) ? (path as string) : fallback;
}

/** Recovery links always land on the password update page. */
export const PASSWORD_RECOVERY_NEXT_PATH = "/auth/update-password";

export function resolveConfirmNextPath(input: {
  type: string | null;
  next: string | null;
}): string {
  if (input.type === "recovery") {
    return PASSWORD_RECOVERY_NEXT_PATH;
  }
  return safeAuthNextPath(input.next, "/home");
}

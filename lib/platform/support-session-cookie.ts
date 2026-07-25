import { cookies } from "next/headers";

/** HttpOnly cookie pointing at the active platform support session id. */
export const PLATFORM_SUPPORT_SESSION_COOKIE = "sp_platform_support_session";

export async function readPlatformSupportSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(PLATFORM_SUPPORT_SESSION_COOKIE)?.value?.trim();
  return value || null;
}

export async function writePlatformSupportSessionCookie(
  sessionId: string,
  expiresAt: Date,
): Promise<void> {
  const jar = await cookies();
  jar.set(PLATFORM_SUPPORT_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearPlatformSupportSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PLATFORM_SUPPORT_SESSION_COOKIE);
}

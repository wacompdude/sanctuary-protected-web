import { cookies } from "next/headers";

/** HttpOnly cookie storing the user's selected church id. Always re-validated server-side. */
export const ACTIVE_CHURCH_COOKIE = "sp_active_church_id";

export async function readActiveChurchCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(ACTIVE_CHURCH_COOKIE)?.value?.trim();
  return value || null;
}

export async function writeActiveChurchCookie(churchId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_CHURCH_COOKIE, churchId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveChurchCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_CHURCH_COOKIE);
}

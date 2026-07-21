import { cookies } from "next/headers";
import { CAMPUS_FILTER_ALL } from "@/lib/campuses/constants";

/** HttpOnly cookie for the global campus filter. Empty / missing / `all` = All Campuses. */
export const ACTIVE_CAMPUS_COOKIE = "sp_active_campus_id";

export async function readActiveCampusCookie(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(ACTIVE_CAMPUS_COOKIE)?.value?.trim();
  return value || null;
}

export async function writeActiveCampusCookie(campusIdOrAll: string): Promise<void> {
  const jar = await cookies();
  const value =
    !campusIdOrAll || campusIdOrAll === CAMPUS_FILTER_ALL
      ? CAMPUS_FILTER_ALL
      : campusIdOrAll;
  jar.set(ACTIVE_CAMPUS_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveCampusCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_CAMPUS_COOKIE);
}

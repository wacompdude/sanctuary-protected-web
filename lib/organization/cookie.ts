import { cookies } from "next/headers";

/**
 * HttpOnly cookie storing the user's selected organization id.
 * Always re-validated server-side.
 *
 * Wire name uses organization terminology. Legacy `sp_active_church_id` is
 * still read for one release so existing sessions keep their selection.
 */
export const ACTIVE_ORGANIZATION_COOKIE = "sp_active_organization_id";
/** @deprecated Read-only compatibility with pre-rename cookies */
export const ACTIVE_CHURCH_COOKIE_LEGACY = "sp_active_church_id";
/** @deprecated Use ACTIVE_ORGANIZATION_COOKIE */
export const ACTIVE_CHURCH_COOKIE = ACTIVE_ORGANIZATION_COOKIE;

export async function readActiveOrganizationCookie(): Promise<string | null> {
  const jar = await cookies();
  const value =
    jar.get(ACTIVE_ORGANIZATION_COOKIE)?.value?.trim() ||
    jar.get(ACTIVE_CHURCH_COOKIE_LEGACY)?.value?.trim();
  return value || null;
}

/** @deprecated Use readActiveOrganizationCookie */
export const readActiveChurchCookie = readActiveOrganizationCookie;

export async function writeActiveOrganizationCookie(
  organizationId: string,
): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Drop legacy cookie if present so we don't keep two sources of truth.
  jar.delete(ACTIVE_CHURCH_COOKIE_LEGACY);
}

/** @deprecated Use writeActiveOrganizationCookie */
export const writeActiveChurchCookie = writeActiveOrganizationCookie;

export async function clearActiveOrganizationCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_ORGANIZATION_COOKIE);
  jar.delete(ACTIVE_CHURCH_COOKIE_LEGACY);
}

/** @deprecated Use clearActiveOrganizationCookie */
export const clearActiveChurchCookie = clearActiveOrganizationCookie;

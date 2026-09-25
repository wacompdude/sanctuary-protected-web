import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  MFA_COOKIE_NAME,
  createMfaCookieValue,
  mfaCookieOptions,
} from "@/lib/mfa/session-cookie";

export type MfaSessionCookieWriteInput = {
  userId: string;
  sessionId: string;
  kind?: "verified" | "policy_skip";
  organizationId?: string | null;
  lastMfaAtMs?: number | null;
};

export async function readMfaCookieValue(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(MFA_COOKIE_NAME)?.value;
}

export async function writeMfaSessionCookie(
  input: MfaSessionCookieWriteInput,
): Promise<boolean> {
  const signed = await createMfaCookieValue(input);
  if (!signed) return false;
  const jar = await cookies();
  jar.set(MFA_COOKIE_NAME, signed.value, mfaCookieOptions(signed.expires));
  return true;
}

export function applyMfaCookieToResponse(
  response: NextResponse,
  signed: { value: string; expires: Date },
): void {
  response.cookies.set(
    MFA_COOKIE_NAME,
    signed.value,
    mfaCookieOptions(signed.expires),
  );
}

/**
 * Same-origin relative redirect. Rejects a destination that would leave
 * the request origin (defense in depth on top of safeMfaNextPath).
 */
export function redirectToSameOriginPath(
  request: Request,
  path: string,
): NextResponse {
  const origin = new URL(request.url).origin;
  const dest = new URL(path, origin);
  if (dest.origin !== origin) {
    return NextResponse.redirect(new URL("/home", origin));
  }
  return NextResponse.redirect(dest);
}

export async function redirectWithMfaSessionCookie(
  request: Request,
  nextPath: string,
  input: MfaSessionCookieWriteInput,
): Promise<NextResponse | null> {
  const signed = await createMfaCookieValue(input);
  if (!signed) return null;
  const response = redirectToSameOriginPath(request, nextPath);
  applyMfaCookieToResponse(response, signed);
  return response;
}

export async function clearMfaSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(MFA_COOKIE_NAME);
}

import { cookies } from "next/headers";
import {
  MFA_COOKIE_NAME,
  createMfaCookieValue,
  mfaCookieOptions,
} from "@/lib/mfa/session-cookie";

export async function readMfaCookieValue(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(MFA_COOKIE_NAME)?.value;
}

export async function writeMfaSessionCookie(input: {
  userId: string;
  sessionId: string;
  kind?: "verified" | "policy_skip";
  organizationId?: string | null;
  lastMfaAtMs?: number | null;
}): Promise<boolean> {
  const signed = await createMfaCookieValue(input);
  if (!signed) return false;
  const jar = await cookies();
  jar.set(MFA_COOKIE_NAME, signed.value, mfaCookieOptions(signed.expires));
  return true;
}

export async function clearMfaSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(MFA_COOKIE_NAME);
}

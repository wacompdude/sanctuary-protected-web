import { normalizePhoneE164 } from "@/lib/notifications/endpoints/normalize";

const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export function toVerifiedPhoneE164(value: string): string | null {
  const normalized = normalizePhoneE164(value);
  if (!normalized || !E164_PATTERN.test(normalized)) return null;
  return normalized;
}

export function isE164Phone(value: string): boolean {
  return E164_PATTERN.test(value);
}

/**
 * Login SMS destination is always the stored verified number.
 * Any phone typed at login is ignored.
 */
export function resolveLoginSmsDestination(verifiedPhone: string | null): string | null {
  if (!verifiedPhone || !isE164Phone(verifiedPhone)) return null;
  return verifiedPhone;
}

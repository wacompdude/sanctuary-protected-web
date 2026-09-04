import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export type TrustedDeviceCookieParts = {
  deviceId: string;
  token: string;
};

const DEVICE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/i;

function getTrustedDevicePepper(): string {
  return (
    process.env.TRUSTED_DEVICE_PEPPER?.trim() ||
    process.env.MFA_CODE_PEPPER?.trim() ||
    process.env.MFA_SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "sanctuary-trusted-device-dev-pepper"
  );
}

export function generateTrustedDeviceId(): string {
  return randomUUID();
}

export function generateTrustedDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashTrustedDeviceToken(deviceId: string, token: string): string {
  return createHash("sha256")
    .update(`${getTrustedDevicePepper()}:${deviceId}:${token}`)
    .digest("hex");
}

export function trustedDeviceHashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function formatTrustedDeviceCookieValue(parts: TrustedDeviceCookieParts): string {
  return `${parts.deviceId}.${parts.token}`;
}

export function parseTrustedDeviceCookieValue(
  value: string | undefined | null,
): TrustedDeviceCookieParts | null {
  const raw = value?.trim() ?? "";
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const deviceId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!DEVICE_ID_RE.test(deviceId) || !TOKEN_RE.test(token)) return null;
  return { deviceId, token };
}

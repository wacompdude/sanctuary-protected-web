import {
  MFA_COOKIE_NAME,
  MFA_SESSION_MAX_AGE_SECONDS,
} from "@/lib/mfa/policy";

export { MFA_COOKIE_NAME };

type MfaCookiePayload = {
  uid: string;
  sid: string;
  exp: number;
};

function getMfaCookieSecret(): string {
  return (
    process.env.MFA_SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.NOTIFICATION_DISPATCH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : "sanctuary-mfa-dev-cookie-secret")
  );
}

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textToBytes(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textToBytes(message) as BufferSource,
  );
  return bytesToBase64Url(signature);
}

export function getAuthSessionBinding(
  accessToken: string | undefined,
  userId: string,
): string {
  if (!accessToken) return `user:${userId}`;
  const parts = accessToken.split(".");
  if (parts.length < 2) return `user:${userId}`;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
    const payload = JSON.parse(json) as {
      session_id?: unknown;
      sessionId?: unknown;
      iat?: unknown;
    };
    if (typeof payload.session_id === "string" && payload.session_id) {
      return payload.session_id;
    }
    if (typeof payload.sessionId === "string" && payload.sessionId) {
      return payload.sessionId;
    }
    if (typeof payload.iat === "number") {
      return `iat:${payload.iat}`;
    }
  } catch {
    return `user:${userId}`;
  }
  return `user:${userId}`;
}

export async function createMfaCookieValue(input: {
  userId: string;
  sessionId: string;
  maxAgeSeconds?: number;
}): Promise<{ value: string; expires: Date } | null> {
  const secret = getMfaCookieSecret();
  if (!secret) return null;
  const maxAge = input.maxAgeSeconds ?? MFA_SESSION_MAX_AGE_SECONDS;
  const expires = new Date(Date.now() + maxAge * 1000);
  const payload: MfaCookiePayload = {
    uid: input.userId,
    sid: input.sessionId,
    exp: Math.floor(expires.getTime() / 1000),
  };
  const body = bytesToBase64Url(textToBytes(JSON.stringify(payload)));
  const signature = await hmacSha256(secret, body);
  return { value: `${body}.${signature}`, expires };
}

export async function verifyMfaCookie(input: {
  token: string | undefined;
  userId: string;
  sessionId: string;
}): Promise<boolean> {
  const secret = getMfaCookieSecret();
  const token = input.token?.trim();
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = await hmacSha256(secret, body);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) return false;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(body)),
    ) as MfaCookiePayload;
    if (payload.uid !== input.userId) return false;
    if (payload.sid !== input.sessionId) return false;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function mfaCookieOptions(expires: Date): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  };
}

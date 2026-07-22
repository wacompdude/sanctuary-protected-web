import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Resend/Svix webhook signatures without adding the svix package.
 * Uses the raw request body bytes and svix-* headers.
 */
export function verifyResendWebhookSignature(params: {
  payload: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
  /** Max age of webhook timestamp in seconds (default 5 minutes). */
  toleranceSeconds?: number;
}): boolean {
  const tolerance = params.toleranceSeconds ?? 300;
  const timestamp = Number(params.svixTimestamp);
  if (!Number.isFinite(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) return false;

  const key = decodeWebhookSecret(params.secret);
  if (!key) return false;

  const signedContent = `${params.svixId}.${params.svixTimestamp}.${params.payload}`;
  const expected = createHmac("sha256", key).update(signedContent).digest("base64");

  const candidates = params.svixSignature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [, sig] = part.split(",", 2);
      return sig || part;
    });

  return candidates.some((candidate) => safeEqualBase64(candidate, expected));
}

function decodeWebhookSecret(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const raw = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

function safeEqualBase64(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

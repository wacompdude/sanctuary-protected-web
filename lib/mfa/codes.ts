import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { MFA_CODE_LENGTH } from "@/lib/mfa/policy";

function getMfaCodePepper(): string {
  return (
    process.env.MFA_CODE_PEPPER?.trim() ||
    process.env.MFA_SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "sanctuary-mfa-dev-pepper"
  );
}

export function generateMfaCode(): string {
  const max = 10 ** MFA_CODE_LENGTH;
  return String(randomInt(0, max)).padStart(MFA_CODE_LENGTH, "0");
}

export function normalizeMfaCodeInput(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== MFA_CODE_LENGTH) return null;
  return digits;
}

export function hashMfaCode(code: string, challengeId: string): string {
  return createHash("sha256")
    .update(`${getMfaCodePepper()}:${challengeId}:${code}`)
    .digest("hex");
}

export function mfaCodeHashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

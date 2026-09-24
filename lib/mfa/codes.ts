import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { MFA_CODE_LENGTH } from "@/lib/mfa/policy";
import { getMfaCodePepper } from "@/lib/mfa/secrets";

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

/**
 * Dedicated MFA cryptographic material.
 *
 * Production requires three independent secrets:
 * MFA_SESSION_SECRET, MFA_CODE_PEPPER, and TRUSTED_DEVICE_PEPPER.
 * They do not fall back to each other, CRON_SECRET, or
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Development (non-production) may use local well-known fallbacks so
 * self-checks and `next dev` work without extra env.
 */

export const MFA_SESSION_SECRET_ENV = "MFA_SESSION_SECRET";
export const MFA_CODE_PEPPER_ENV = "MFA_CODE_PEPPER";
export const TRUSTED_DEVICE_PEPPER_ENV = "TRUSTED_DEVICE_PEPPER";

const DEV_SESSION_SECRET = "sanctuary-mfa-dev-cookie-secret";
const DEV_CODE_PEPPER = "sanctuary-mfa-dev-pepper";
const DEV_TRUSTED_DEVICE_PEPPER = "sanctuary-trusted-device-dev-pepper";

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

function dedicated(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Signs web `sp_mfa` cookies and mobile MFA tokens.
 * Empty in production when MFA_SESSION_SECRET is missing (fail closed).
 */
export function getMfaSessionSecret(): string {
  const value = dedicated(MFA_SESSION_SECRET_ENV);
  if (value) return value;
  if (isProductionRuntime()) return "";
  return DEV_SESSION_SECRET;
}

/**
 * Secrets that may verify an existing MFA cookie/token.
 * Production verifies only the dedicated secret — never service-role/cron.
 */
export function listMfaSessionVerifySecrets(): string[] {
  const secret = getMfaSessionSecret();
  return secret ? [secret] : [];
}

export function getMfaCodePepper(): string {
  const dedicatedPepper = dedicated(MFA_CODE_PEPPER_ENV);
  if (dedicatedPepper) return dedicatedPepper;
  if (isProductionRuntime()) return "";
  return DEV_CODE_PEPPER;
}

export function getTrustedDevicePepper(): string {
  const value = dedicated(TRUSTED_DEVICE_PEPPER_ENV);
  if (value) return value;
  if (isProductionRuntime()) return "";
  return DEV_TRUSTED_DEVICE_PEPPER;
}

export function isMfaSessionSecretConfigured(): boolean {
  return getMfaSessionSecret().length > 0;
}

export function isMfaCodePepperConfigured(): boolean {
  return getMfaCodePepper().length > 0;
}

export function isTrustedDevicePepperConfigured(): boolean {
  return getTrustedDevicePepper().length > 0;
}

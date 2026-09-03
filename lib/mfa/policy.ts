/**
 * Login MFA product policy (application-level, independent of Bird).
 *
 * Normal login
 *   1. User enters email + password.
 *   2. Supabase validates those credentials (session is AAL1 only).
 *   3. Access is not granted until a second factor succeeds.
 *   4. Primary factor: 6-digit code sent to the account email.
 *   5. Backup factor: 6-digit SMS code, only if a verified phone is on file.
 *
 * Backup SMS
 *   - Login never accepts a phone number from the sign-in form.
 *   - SMS is offered only when sms_backup_enabled and verified_phone are set.
 *   - The number shown is masked. The code is sent to stored verified_phone.
 *
 * Verified phone
 *   - Stored in user_security_settings in E.164 (e.g. +14255551234).
 *   - Written only after the signed-in user proves possession via SMS code.
 *   - Profile contact phone is not treated as verified for MFA.
 *
 * Out of scope for this pass
 *   - Bird Verify wiring (SMS sender is a stub / console in development).
 *   - Trusted-device skip (column reserved).
 *   - Platform console TOTP remains a separate gate for platform admins.
 */

export const MFA_CODE_LENGTH = 6;
export const MFA_CODE_TTL_MS = 10 * 60 * 1000;
export const MFA_RESEND_COOLDOWN_MS = 60 * 1000;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const MFA_COOKIE_NAME = "sp_mfa";

export const MFA_PURPOSES = ["login", "phone_enroll"] as const;
export type MfaPurpose = (typeof MFA_PURPOSES)[number];

export const MFA_CHANNELS = ["email", "sms"] as const;
export type MfaChannel = (typeof MFA_CHANNELS)[number];

export function isMfaLoginEnabled(): boolean {
  const raw = process.env.MFA_LOGIN_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

export function isMfaPurpose(value: string): value is MfaPurpose {
  return (MFA_PURPOSES as readonly string[]).includes(value);
}

export function isMfaChannel(value: string): value is MfaChannel {
  return (MFA_CHANNELS as readonly string[]).includes(value);
}

/**
 * Login MFA product policy (application-level, independent of Bird).
 *
 * Normal login
 *   1. User enters email + password.
 *   2. Supabase validates those credentials (session is AAL1 only).
 *   3. Access is not granted until a second factor succeeds.
 *   4. Primary factor: 6-digit code sent to the account email.
 *   5. Backup factor: 6-digit Text/SMS code, only if a verified phone is on file.
 *
 * Backup Text/SMS
 *   - Login never accepts a phone number from the sign-in form.
 *   - Text/SMS is offered only when sms_backup_enabled and verified_phone are set.
 *   - The number shown is masked. The code is sent to stored verified_phone.
 *
 * Verified phone
 *   - Stored in user_security_settings in E.164 (e.g. +14255551234).
 *   - Written only after the signed-in user proves possession via Text/SMS code.
 *   - Profile contact phone is not treated as verified for MFA.
 *
 * Trusted devices
 *   - After MFA succeeds, the user may register this browser for a limited period.
 *   - A valid trusted-device cookie may skip the next MFA challenge for that user.
 *   - Account verification and device trust remain separate states.
 *   - Require MFA Immediately temporarily blocks trusted-device skip until the
 *     user completes actual login MFA after the cutoff. Devices are not deleted.
 *
 * MFA session cookie (`sp_mfa`)
 *   - Records that this Auth session has satisfied (or is not required to
 *     satisfy) MFA under the current policy.
 *   - Lifetime is MFA_SESSION_DURATION_SECONDS (~12 hours).
 *   - Policy-skip uses the same cookie with kind=policy_skip. It is NOT a
 *     trusted device.
 *
 * Emergency override
 *   - MFA_LOGIN_ENABLED=false is an operational kill switch.
 *   - It is independent of Platform/organization MFA policy rows.
 *   - Missing or invalid values fail secure (MFA capability remains enabled).
 *
 * Out of scope for this pass
 *   - Bird Verify wiring (Text/SMS sender is a stub / console in development).
 *   - Platform console TOTP remains a separate gate for platform admins.
 */

export const MFA_CODE_LENGTH = 6;
export const MFA_CODE_TTL_MS = 10 * 60 * 1000;
export const MFA_RESEND_COOLDOWN_MS = 60 * 1000;
export const MFA_MAX_ATTEMPTS = 5;

/**
 * Lifetime of the HttpOnly `sp_mfa` cookie.
 * Used for both completed MFA (`kind=verified`) and policy-skip (`kind=policy_skip`).
 */
export const MFA_SESSION_DURATION_SECONDS = 60 * 60 * 12;
/** Policy-skip cookies share the MFA session lifetime by design. */
export const MFA_POLICY_SKIP_DURATION_SECONDS = MFA_SESSION_DURATION_SECONDS;
/** Alias of MFA_SESSION_DURATION_SECONDS. */
export const MFA_SESSION_MAX_AGE_SECONDS = MFA_SESSION_DURATION_SECONDS;
export const MFA_COOKIE_NAME = "sp_mfa";

export const MFA_PURPOSES = ["login", "phone_enroll"] as const;
export type MfaPurpose = (typeof MFA_PURPOSES)[number];

export const MFA_CHANNELS = ["email", "sms"] as const;
export type MfaChannel = (typeof MFA_CHANNELS)[number];

/**
 * Emergency operational switch. Independent of Platform/organization MFA policy.
 *
 * Fail secure:
 *   missing / empty / invalid → MFA capability enabled
 *   "false" (trimmed, case-insensitive) → emergency bypass
 *
 * "0", "off", and other values do NOT disable MFA.
 */
export function isMfaEmergencyOverrideActive(
  raw: string | undefined = process.env.MFA_LOGIN_ENABLED,
): boolean {
  return (raw ?? "").trim().toLowerCase() === "false";
}

export function isMfaLoginEnabled(
  raw: string | undefined = process.env.MFA_LOGIN_ENABLED,
): boolean {
  return !isMfaEmergencyOverrideActive(raw);
}

export function isMfaPurpose(value: string): value is MfaPurpose {
  return (MFA_PURPOSES as readonly string[]).includes(value);
}

export function isMfaChannel(value: string): value is MfaChannel {
  return (MFA_CHANNELS as readonly string[]).includes(value);
}

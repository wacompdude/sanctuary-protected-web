/**
 * Trusted-device policy.
 *
 * Account verification and device trust are separate:
 *   - Email/account identity can be verified
 *   - Password authentication can succeed
 *   - The current browser is trusted only when a valid credential exists
 *
 * A trusted device may skip the next MFA challenge for this user during
 * the configured period. It is not a permanent MFA bypass.
 */

export const TRUSTED_DEVICE_COOKIE_NAME = "sp_trusted_device";
export const DEFAULT_TRUSTED_DEVICE_DURATION_DAYS = 30;
export const MAX_TRUSTED_DEVICES_PER_USER = 20;

export const UNRECOGNIZED_DEVICE_MESSAGE =
  "We don't recognize this device. Please verify your identity to continue.";

export const IDENTITY_VERIFIED_MESSAGE = "Your identity has been verified.";

export const DEVICE_NOW_TRUSTED_MESSAGE =
  "This device is now trusted. You may not be asked for an additional verification code when signing in from this device during the trusted period.";

export function getTrustedDeviceDurationDays(): number {
  const raw = process.env.TRUSTED_DEVICE_DURATION_DAYS?.trim();
  if (!raw) return DEFAULT_TRUSTED_DEVICE_DURATION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
    return DEFAULT_TRUSTED_DEVICE_DURATION_DAYS;
  }
  return parsed;
}

export function getTrustedDeviceDurationMs(): number {
  return getTrustedDeviceDurationDays() * 24 * 60 * 60 * 1000;
}

export function getTrustedDeviceMaxAgeSeconds(): number {
  return getTrustedDeviceDurationDays() * 24 * 60 * 60;
}

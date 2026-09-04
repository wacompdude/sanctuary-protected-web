import {
  TRUSTED_DEVICE_COOKIE_NAME,
  getTrustedDeviceMaxAgeSeconds,
} from "@/lib/mfa/trusted-device-policy";

export { TRUSTED_DEVICE_COOKIE_NAME };

export function trustedDeviceCookieOptions(expires: Date): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires: Date;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
    maxAge: Math.max(1, Math.floor((expires.getTime() - Date.now()) / 1000)),
  };
}

export function trustedDeviceCookieExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + getTrustedDeviceMaxAgeSeconds() * 1000);
}

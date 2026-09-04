import { cookies } from "next/headers";
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  trustedDeviceCookieExpiresAt,
  trustedDeviceCookieOptions,
} from "@/lib/mfa/trusted-device-cookie";
import { formatTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-crypto";

export async function readTrustedDeviceCookieValue(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
}

export async function writeTrustedDeviceCookie(input: {
  deviceId: string;
  token: string;
  expiresAt?: Date;
}): Promise<void> {
  const expires = input.expiresAt ?? trustedDeviceCookieExpiresAt();
  const jar = await cookies();
  jar.set(
    TRUSTED_DEVICE_COOKIE_NAME,
    formatTrustedDeviceCookieValue({
      deviceId: input.deviceId,
      token: input.token,
    }),
    trustedDeviceCookieOptions(expires),
  );
}

export async function clearTrustedDeviceCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(TRUSTED_DEVICE_COOKIE_NAME, "", {
    ...trustedDeviceCookieOptions(new Date(0)),
    expires: new Date(0),
  });
}

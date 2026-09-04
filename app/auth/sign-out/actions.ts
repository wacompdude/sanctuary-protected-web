"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clearMfaSessionCookie } from "@/lib/mfa/session";
import { parseTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-crypto";
import {
  clearTrustedDeviceCookie,
  readTrustedDeviceCookieValue,
} from "@/lib/mfa/trusted-device-session";
import {
  getTrustedDevices,
  revokeTrustedDevice,
} from "@/lib/mfa/trusted-devices";

function redirectAfterSignOut(formData?: FormData): never {
  const next = String(formData?.get("next") ?? "").trim();
  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  redirect("/login");
}

/**
 * Clear the auth session server-side, then send the user to login.
 * Prefer this over client-only signOut when escaping redirect loops
 * (e.g. platform-only accounts stuck on church onboarding).
 *
 * Does not revoke the trusted-device cookie. The next password login from
 * this browser may skip MFA if the trusted credential is still valid.
 */
export async function signOutToLoginAction(
  formData?: FormData,
): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearMfaSessionCookie();
  redirectAfterSignOut(formData);
}

/**
 * End the session, revoke this browser's trusted-device record, and delete
 * the trusted-device cookie.
 */
export async function signOutAndForgetDeviceAction(
  formData?: FormData,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const cookieValue = await readTrustedDeviceCookieValue();
    const currentDeviceId = parseTrustedDeviceCookieValue(cookieValue)?.deviceId;
    if (currentDeviceId) {
      const devices = await getTrustedDevices(user.id, currentDeviceId);
      const current = devices.find((device) => device.isCurrent);
      if (current) {
        await revokeTrustedDevice({
          userId: user.id,
          deviceRecordId: current.id,
          reason: "logout_and_forget",
        });
      }
    }
  }

  await supabase.auth.signOut();
  await clearMfaSessionCookie();
  await clearTrustedDeviceCookie();
  redirectAfterSignOut(formData);
}

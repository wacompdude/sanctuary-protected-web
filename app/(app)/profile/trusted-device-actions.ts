"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-crypto";
import {
  clearTrustedDeviceCookie,
  readTrustedDeviceCookieValue,
} from "@/lib/mfa/trusted-device-session";
import {
  getTrustedDevices,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
} from "@/lib/mfa/trusted-devices";

export type TrustedDeviceActionState = {
  error?: string;
  success?: boolean;
};

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function listOwnTrustedDevicesForProfile() {
  const userId = await requireUserId();
  if (!userId) return [];
  const cookieValue = await readTrustedDeviceCookieValue();
  const currentDeviceId = parseTrustedDeviceCookieValue(cookieValue)?.deviceId ?? null;
  return getTrustedDevices(userId, currentDeviceId);
}

export async function revokeOwnTrustedDeviceAction(
  _prev: TrustedDeviceActionState,
  formData: FormData,
): Promise<TrustedDeviceActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "You must be signed in." };

  const deviceRecordId = String(formData.get("device_id") ?? "").trim();
  if (!deviceRecordId) return { error: "Choose a device to remove." };

  const cookieValue = await readTrustedDeviceCookieValue();
  const currentDeviceId = parseTrustedDeviceCookieValue(cookieValue)?.deviceId;
  const devices = await getTrustedDevices(userId, currentDeviceId);
  const target = devices.find((device) => device.id === deviceRecordId);

  const result = await revokeTrustedDevice({
    userId,
    deviceRecordId,
    reason: "user_revoked",
  });
  if (!result.ok) {
    return { error: result.error ?? "Unable to remove that device." };
  }

  if (target?.isCurrent) {
    await clearTrustedDeviceCookie();
  }

  revalidatePath("/profile");
  return { success: true };
}

export async function revokeAllOwnTrustedDevicesAction(): Promise<TrustedDeviceActionState> {
  const userId = await requireUserId();
  if (!userId) return { error: "You must be signed in." };

  const result = await revokeAllTrustedDevices(userId, "user_revoked_all");
  if (!result.ok) {
    return { error: result.error ?? "Unable to remove trusted devices." };
  }

  await clearTrustedDeviceCookie();
  revalidatePath("/profile");
  return { success: true };
}

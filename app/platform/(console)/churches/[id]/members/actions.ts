"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { revokeAllTrustedDevices } from "@/lib/mfa/trusted-devices";

export type PlatformTrustedDeviceActionState = {
  error?: string;
  success?: boolean;
};

export async function revokeMemberTrustedDevicesAction(
  _prev: PlatformTrustedDeviceActionState,
  formData: FormData,
): Promise<PlatformTrustedDeviceActionState> {
  try {
    await requirePlatformPermission("users.revoke_trusted_devices");
  } catch {
    return { error: "You do not have permission to revoke trusted devices." };
  }

  const userId = String(formData.get("user_id") ?? "").trim();
  const churchId = String(formData.get("church_id") ?? "").trim();
  if (!userId) {
    return { error: "Choose a member." };
  }

  const result = await revokeAllTrustedDevices(userId, "platform_admin_revoked");
  if (!result.ok) {
    return { error: result.error ?? "Unable to revoke trusted devices." };
  }

  if (churchId) {
    revalidatePath(`/platform/churches/${churchId}/members`);
  }
  return { success: true };
}

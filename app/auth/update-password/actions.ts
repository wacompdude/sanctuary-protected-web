"use server";

import { createClient } from "@/lib/supabase/server";
import { clearTrustedDeviceCookie } from "@/lib/mfa/trusted-device-session";
import { revokeAllTrustedDevices } from "@/lib/mfa/trusted-devices";
import { validatePassword } from "@/lib/auth/validation";

export type UpdatePasswordActionState = {
  error?: string;
  success?: boolean;
};

export async function completePasswordRecoveryAction(
  _prev: UpdatePasswordActionState,
  formData: FormData,
): Promise<UpdatePasswordActionState> {
  const password = String(formData.get("password") ?? "");
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Open the reset link from your email first." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message || "Unable to update your password." };
  }

  await revokeAllTrustedDevices(user.id, "password_reset");
  await clearTrustedDeviceCookie();
  return { success: true };
}

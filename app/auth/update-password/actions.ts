"use server";

import { createClient } from "@/lib/supabase/server";
import { clearMfaSessionCookie } from "@/lib/mfa/session";
import { clearTrustedDeviceCookie } from "@/lib/mfa/trusted-device-session";
import { revokeAllTrustedDevices } from "@/lib/mfa/trusted-devices";
import {
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";

export type UpdatePasswordActionState = {
  error?: string;
  fieldErrors?: {
    password?: string;
    confirmPassword?: string;
  };
  success?: boolean;
};

/**
 * Completes password recovery after a verified recovery session.
 * Signs the user out afterward so they must authenticate (and MFA) normally.
 */
export async function completePasswordRecoveryAction(
  _prev: UpdatePasswordActionState,
  formData: FormData,
): Promise<UpdatePasswordActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const passwordError = validatePassword(password);
  const confirmError = validatePasswordConfirmation(password, confirmPassword);
  if (passwordError || confirmError) {
    return {
      fieldErrors: {
        password: passwordError ?? undefined,
        confirmPassword: confirmError ?? undefined,
      },
    };
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
    // Avoid logging password material; message only.
    console.error("password recovery update failed:", error.message);
    return { error: "Unable to update your password. Request a new reset link." };
  }

  try {
    await revokeAllTrustedDevices(user.id, "password_reset");
  } catch (err: unknown) {
    console.error(
      "password recovery trusted-device revoke failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
  await clearTrustedDeviceCookie();
  await clearMfaSessionCookie();

  // End recovery session — require normal login + MFA.
  await supabase.auth.signOut();

  return { success: true };
}

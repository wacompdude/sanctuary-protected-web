"use server";

import { createClient } from "@/lib/supabase/server";
import { buildPasswordRecoveryRedirectUrl } from "@/lib/auth/app-origin";
import { validateEmail } from "@/lib/auth/validation";

export type ForgotPasswordActionState = {
  error?: string;
  fieldError?: string;
  submitted?: boolean;
};

const GENERIC_SUCCESS: ForgotPasswordActionState = { submitted: true };

/**
 * Starts Supabase password recovery. Always returns a generic success
 * payload after validation so the UI cannot enumerate accounts.
 */
export async function requestPasswordResetAction(
  _prev: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const email = String(formData.get("email") ?? "");
  const fieldError = validateEmail(email);
  if (fieldError) {
    return { fieldError };
  }

  const redirectTo = buildPasswordRecoveryRedirectUrl();

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) {
      // Do not surface provider details (may leak account existence).
      console.error("password reset request failed:", error.message);
    }
  } catch (err: unknown) {
    console.error(
      "password reset request exception:",
      err instanceof Error ? err.message : "unknown",
    );
  }

  return GENERIC_SUCCESS;
}

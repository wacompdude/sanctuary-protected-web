import { createClient } from "@/lib/supabase/server";

export type StepUpResult =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: { current_password?: string };
    };

/**
 * Confirm the signed-in user's password before sensitive MFA changes.
 * Does not send SMS. Uses the existing Supabase password session.
 */
export async function requirePasswordStepUp(
  currentPassword: string,
): Promise<StepUpResult> {
  const password = currentPassword.trim();
  if (!password) {
    return {
      ok: false,
      error: "Enter your current password to continue.",
      fieldErrors: { current_password: "Current password is required." },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id || !user.email) {
    return { ok: false, error: "You must be signed in." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (verifyError) {
    return {
      ok: false,
      error: "Current password is incorrect.",
      fieldErrors: { current_password: "Current password is incorrect." },
    };
  }

  return { ok: true, userId: user.id, email: user.email };
}

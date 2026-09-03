"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clearMfaSessionCookie } from "@/lib/mfa/session";

/**
 * Clear the auth session server-side, then send the user to login.
 * Prefer this over client-only signOut when escaping redirect loops
 * (e.g. platform-only accounts stuck on church onboarding).
 */
export async function signOutToLoginAction(
  formData?: FormData,
): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearMfaSessionCookie();

  const next = String(formData?.get("next") ?? "").trim();
  if (next.startsWith("/") && !next.startsWith("//")) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  redirect("/login");
}

import { createClient } from "@/lib/supabase/server";
import { resolveConfirmNextPath } from "@/lib/auth/safe-next";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase email confirmation / recovery callback (token_hash + type).
 * Recovery always continues to /auth/update-password.
 * Rejects open redirects via resolveConfirmNextPath.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next");

  if (!token_hash || !type) {
    return NextResponse.redirect(
      new URL("/auth/error?error=invalid_or_expired_link", origin),
    );
  }

  const nextPath = resolveConfirmNextPath({ type, next: rawNext });

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash,
  });

  if (error) {
    console.error("auth confirm verifyOtp failed:", error.message);
    return NextResponse.redirect(
      new URL("/auth/error?error=invalid_or_expired_link", origin),
    );
  }

  const dest = new URL(nextPath, origin);
  if (dest.origin !== origin) {
    return NextResponse.redirect(new URL("/auth/update-password", origin));
  }
  return NextResponse.redirect(dest);
}

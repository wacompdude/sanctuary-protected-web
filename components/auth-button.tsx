import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { hasEnvVars } from "@/lib/supabase/env";

function isPrerenderControlError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest) : "";
  return (
    digest === "HANGING_PROMISE_REJECTION" ||
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND")
  );
}

export async function AuthButton() {
  if (!hasEnvVars) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const user = data?.claims;

    return user ? (
      <div className="flex items-center gap-4">
        Hey, {user.email}!
        <LogoutButton />
      </div>
    ) : (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm" variant="default">
          <Link href="/register">Sign up</Link>
        </Button>
      </div>
    );
  } catch (error) {
    // Do not swallow Next.js prerender/control-flow rejections.
    if (isPrerenderControlError(error)) {
      throw error;
    }
    console.error("AuthButton failed:", error);
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
}

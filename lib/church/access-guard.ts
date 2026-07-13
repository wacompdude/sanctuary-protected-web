import { redirect } from "next/navigation";
import { ChurchAccessError } from "@/lib/church/errors";

/** True when Next.js redirect()/notFound() threw and must be rethrown. */
export function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest =
    "digest" in error ? String((error as { digest?: unknown }).digest) : "";
  if (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND")
  ) {
    return true;
  }
  return error instanceof Error && error.message === "NEXT_REDIRECT";
}

/**
 * If the user has no active church membership, send them to onboarding.
 * Rethrows Next.js control-flow errors so try/catch cannot swallow redirects.
 */
export function rethrowOrRedirectForChurchAccess(error: unknown): void {
  if (isNextControlFlowError(error)) {
    throw error;
  }

  if (
    error instanceof ChurchAccessError &&
    error.code === "NO_ACTIVE_MEMBERSHIP"
  ) {
    redirect("/onboarding/church");
  }
}

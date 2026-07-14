import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ChurchAccessError } from "@/lib/church/errors";
import {
  isChurchOperationallyLocked,
  isChurchRecoveryPath,
} from "@/lib/church/operations";
import type { ChurchStatus } from "@/lib/church/types";

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

  if (
    error instanceof ChurchAccessError &&
    error.code === "CHURCH_SUSPENDED"
  ) {
    redirect("/settings/church/danger");
  }
}

/** Redirect owners of locked churches away from operational pages. */
export async function enforceChurchOperationalAccess(
  status: ChurchStatus | string | null | undefined,
): Promise<void> {
  if (!isChurchOperationallyLocked(status)) return;

  const headerStore = await headers();
  const pathname =
    headerStore.get("x-pathname") ||
    headerStore.get("x-invoke-path") ||
    headerStore.get("next-url") ||
    "";

  // When pathname is unavailable, prefer soft banner-only (caller still uses
  // requireOperationalChurch on write actions). Redirect home-like entries.
  if (!pathname || pathname === "/home" || pathname === "/dashboard") {
    redirect("/settings/church/danger");
  }

  if (!isChurchRecoveryPath(pathname)) {
    redirect("/settings/church/danger");
  }
}

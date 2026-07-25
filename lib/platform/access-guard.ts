import { redirect } from "next/navigation";
import { isNextControlFlowError } from "@/lib/church/access-guard";
import { PlatformAccessError } from "@/lib/platform/errors";
import {
  PLATFORM_SETUP_MFA_PATH,
  PLATFORM_SETUP_PASSWORD_PATH,
} from "@/lib/platform/routes";

export { isNextControlFlowError };

/**
 * Map platform access failures to redirects.
 * Never reveals whether a platform account exists beyond home redirect.
 */
export function rethrowOrRedirectForPlatformAccess(error: unknown): void {
  if (isNextControlFlowError(error)) {
    throw error;
  }

  if (!(error instanceof PlatformAccessError)) {
    throw error;
  }

  switch (error.code) {
    case "SETUP_PASSWORD_REQUIRED":
      redirect(PLATFORM_SETUP_PASSWORD_PATH);
      break;
    case "SETUP_MFA_REQUIRED":
    case "MFA_REQUIRED":
      redirect(PLATFORM_SETUP_MFA_PATH);
      break;
    case "UNAUTHENTICATED":
      redirect("/login?next=/platform");
      break;
    case "NO_PLATFORM_ACCOUNT":
    case "ACCOUNT_DISABLED":
    case "ACCOUNT_LOCKED":
    case "ACCOUNT_ARCHIVED":
    case "ACCOUNT_NOT_ACTIVE":
    case "FORBIDDEN_PERMISSION":
    case "TABLES_UNAVAILABLE":
    case "LOAD_FAILED":
    case "REAUTH_REQUIRED":
    default:
      redirect("/home");
      break;
  }
}

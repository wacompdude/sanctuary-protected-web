import { PlatformAccessError } from "@/lib/platform/errors";
import { requirePlatformPermission } from "@/lib/platform/auth";
import type { PlatformContext } from "@/lib/platform/types";

export type MfaPolicyManagementScope = "platform" | "organization";

export type AuthorizeMfaPolicyManagementInput = {
  scope: MfaPolicyManagementScope;
  organizationId?: string | null;
};

/**
 * Central authorization for MFA policy changes and forced reauthentication.
 *
 * Today both scopes require `security.mfa_policy.manage` (Super Admin only).
 * Organization scope additionally requires an organization id so a later
 * delegation can limit that permission to one tenant without allowing
 * Platform MFA changes.
 */
export async function authorizeMfaPolicyManagement(
  input: AuthorizeMfaPolicyManagementInput,
): Promise<PlatformContext> {
  if (input.scope === "organization") {
    const organizationId = input.organizationId?.trim();
    if (!organizationId) {
      throw new PlatformAccessError(
        "Choose an organization.",
        "FORBIDDEN_PERMISSION",
      );
    }
  }

  return requirePlatformPermission("security.mfa_policy.manage");
}

"use server";

import { setActiveOrganizationForUser } from "@/lib/organization/context";
import { ChurchAccessError } from "@/lib/organization/errors";
import { loginMfaResumePath, safeMfaNextPath } from "@/lib/mfa/login";

export type SelectOrganizationActionState = {
  error?: string;
  /** Full-document navigation target. Avoid redirect()-to-route-handler, which breaks Server Actions. */
  continuePath?: string;
};

export async function selectOrganizationForMfaAction(
  _prev: SelectOrganizationActionState,
  formData: FormData,
): Promise<SelectOrganizationActionState> {
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const nextPath = safeMfaNextPath(String(formData.get("next") ?? ""));

  if (!organizationId) {
    return { error: "Select a church to continue." };
  }

  try {
    await setActiveOrganizationForUser(organizationId);
  } catch (error) {
    if (error instanceof ChurchAccessError) {
      return { error: error.message };
    }
    return { error: "Unable to select that church." };
  }

  return { continuePath: loginMfaResumePath(nextPath) };
}
/**
 * Server-side MFA policy resolution.
 *
 * Super Admin / /platform destinations follow PLATFORM policy only.
 * Organization MFA OFF never weakens Platform Super Admin login MFA
 * while Platform MFA remains ON.
 *
 * Immediate reauthentication ("Require MFA Immediately") stamps
 * mfa_reauth_after. Existing `sp_mfa` cookies issued before that cutoff
 * are rejected server-side. Trusted-device skip is blocked until the user
 * completes actual login MFA after the cutoff. Trusted-device records are
 * not deleted.
 */
import { createClient } from "@/lib/supabase/server";
import { readActiveOrganizationCookie } from "@/lib/organization/cookie";
import { isMfaEmergencyOverrideActive } from "@/lib/mfa/policy";
import {
  evaluateMfaPolicy,
  isPlatformDestination,
  type EffectiveMfaPolicy,
} from "@/lib/mfa/effective-policy";
import {
  resolveLoginOrganizationFromMemberships,
  uniqueOrganizationIds,
  type LoginOrganizationResolution,
} from "@/lib/mfa/login-organization";
import {
  getOrganizationSecuritySettings,
  getPlatformSecuritySettings,
} from "@/lib/mfa/policy-settings";
import { getOrCreateUserSecuritySettings } from "@/lib/mfa/settings";

export type { LoginOrganizationResolution };

export async function listActiveMembershipOrganizationIds(
  userId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("listActiveMembershipOrganizationIds failed:", error.message);
    return [];
  }

  return uniqueOrganizationIds(data);
}

export async function resolveLoginOrganization(input: {
  userId: string;
  pathname?: string | null;
  organizationId?: string | null;
}): Promise<LoginOrganizationResolution> {
  const membershipIds = isPlatformDestination(input.pathname)
    ? []
    : await listActiveMembershipOrganizationIds(input.userId);
  const cookieId = isPlatformDestination(input.pathname)
    ? null
    : await readActiveOrganizationCookie();
  return resolveLoginOrganizationFromMemberships({
    pathname: input.pathname,
    requestedOrganizationId: input.organizationId,
    cookieOrganizationId: cookieId,
    membershipIds,
  });
}

export async function getEffectiveMfaPolicy(input: {
  userId: string;
  organizationId?: string | null;
  pathname?: string | null;
}): Promise<EffectiveMfaPolicy> {
  const envLoginEnabled = !isMfaEmergencyOverrideActive();
  const [platform, resolution, userSettings] = await Promise.all([
    getPlatformSecuritySettings().catch(() => ({
      mfaEnabled: true,
      mfaReauthAfter: null,
      updatedAt: null,
      updatedBy: null,
    })),
    resolveLoginOrganization({
      userId: input.userId,
      pathname: input.pathname,
      organizationId: input.organizationId,
    }),
    getOrCreateUserSecuritySettings(input.userId).catch(() => null),
  ]);

  let organizationMfaEnabled: boolean | null = null;
  if (resolution.organizationId) {
    const org = await getOrganizationSecuritySettings(resolution.organizationId).catch(
      () => null,
    );
    organizationMfaEnabled = org ? org.mfaEnabled : true;
  }

  return evaluateMfaPolicy({
    envLoginEnabled,
    platformMfaEnabled: platform.mfaEnabled,
    organizationMfaEnabled,
    organizationId: resolution.organizationId,
    audience: resolution.audience,
    userMfaRequired: userSettings?.mfaRequired,
    needsOrganizationSelection: resolution.needsOrganizationSelection,
  });
}

export async function isMfaRequired(input: {
  userId: string;
  organizationId?: string | null;
  pathname?: string | null;
}): Promise<boolean> {
  const policy = await getEffectiveMfaPolicy(input);
  return policy.required;
}

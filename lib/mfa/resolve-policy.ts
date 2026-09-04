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
  type MfaPolicyAudience,
} from "@/lib/mfa/effective-policy";
import {
  getOrganizationSecuritySettings,
  getPlatformSecuritySettings,
} from "@/lib/mfa/policy-settings";
import { getOrCreateUserSecuritySettings } from "@/lib/mfa/settings";

export type LoginOrganizationResolution = {
  organizationId: string | null;
  membershipIds: string[];
  needsOrganizationSelection: boolean;
  audience: MfaPolicyAudience;
};

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

  return [...new Set((data ?? []).map((row) => String(row.organization_id)))];
}

export async function resolveLoginOrganization(input: {
  userId: string;
  pathname?: string | null;
  organizationId?: string | null;
}): Promise<LoginOrganizationResolution> {
  if (isPlatformDestination(input.pathname)) {
    return {
      organizationId: null,
      membershipIds: [],
      needsOrganizationSelection: false,
      audience: "platform",
    };
  }

  const membershipIds = await listActiveMembershipOrganizationIds(input.userId);
  const requested = input.organizationId?.trim() || null;
  if (requested && membershipIds.includes(requested)) {
    return {
      organizationId: requested,
      membershipIds,
      needsOrganizationSelection: false,
      audience: "organization",
    };
  }

  const cookieId = await readActiveOrganizationCookie();
  if (cookieId && membershipIds.includes(cookieId)) {
    return {
      organizationId: cookieId,
      membershipIds,
      needsOrganizationSelection: false,
      audience: "organization",
    };
  }

  if (membershipIds.length === 1) {
    return {
      organizationId: membershipIds[0],
      membershipIds,
      needsOrganizationSelection: false,
      audience: "organization",
    };
  }

  if (membershipIds.length > 1) {
    return {
      organizationId: null,
      membershipIds,
      needsOrganizationSelection: true,
      audience: "unknown",
    };
  }

  return {
    organizationId: null,
    membershipIds,
    needsOrganizationSelection: false,
    audience: "unknown",
  };
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

import {
  getOrganizationSecuritySettings,
  getPlatformSecuritySettings,
  timestampToMs,
} from "@/lib/mfa/policy-settings";

export type MfaReauthRequirement = {
  platformReauthAfterMs: number | null;
  organizationReauthAfterMs: number | null;
  effectiveAtMs: number | null;
};

function maxTimestamp(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null && value > 0);
  if (present.length === 0) return null;
  return Math.max(...present);
}

/**
 * Cutoff after which an existing `sp_mfa` cookie must be reissued.
 * Platform force applies everywhere. Organization force applies only to that org.
 */
export async function getMfaReauthRequirement(input: {
  organizationId?: string | null;
  platformDestination?: boolean;
}): Promise<MfaReauthRequirement> {
  const platform = await getPlatformSecuritySettings().catch(() => null);
  const platformReauthAfterMs = timestampToMs(platform?.mfaReauthAfter ?? null);

  if (input.platformDestination) {
    return {
      platformReauthAfterMs,
      organizationReauthAfterMs: null,
      effectiveAtMs: platformReauthAfterMs,
    };
  }

  let organizationReauthAfterMs: number | null = null;
  if (input.organizationId) {
    const org = await getOrganizationSecuritySettings(input.organizationId).catch(
      () => null,
    );
    organizationReauthAfterMs = timestampToMs(org?.mfaReauthAfter ?? null);
  }

  return {
    platformReauthAfterMs,
    organizationReauthAfterMs,
    effectiveAtMs: maxTimestamp([platformReauthAfterMs, organizationReauthAfterMs]),
  };
}

export function cookieIsStaleForReauth(input: {
  issuedAtMs: number;
  reauthAfterMs: number | null;
}): boolean {
  if (!input.reauthAfterMs || input.reauthAfterMs <= 0) return false;
  return input.issuedAtMs < input.reauthAfterMs;
}

/**
 * Trusted-device skip is allowed only when the last *actual* MFA
 * (email/Text/SMS) is at or after the reauth cutoff. A missing timestamp
 * fails closed whenever a cutoff exists.
 */
export function lastMfaSatisfiesReauth(input: {
  lastMfaAtMs: number | null;
  reauthAfterMs: number | null;
}): boolean {
  if (!input.reauthAfterMs || input.reauthAfterMs <= 0) return true;
  if (!input.lastMfaAtMs || input.lastMfaAtMs <= 0) return false;
  return input.lastMfaAtMs >= input.reauthAfterMs;
}

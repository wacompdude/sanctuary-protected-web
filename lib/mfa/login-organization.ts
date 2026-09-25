import {
  isPlatformDestination,
  type MfaPolicyAudience,
} from "@/lib/mfa/effective-policy";

export type LoginOrganizationResolution = {
  organizationId: string | null;
  membershipIds: string[];
  needsOrganizationSelection: boolean;
  audience: MfaPolicyAudience;
};

export function uniqueOrganizationIds(
  rows: Array<{ organization_id?: unknown }> | null | undefined,
): string[] {
  const ids = (rows ?? [])
    .map((row) => String(row.organization_id ?? "").trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * Authoritative login organization selection shared by MFA continue and
 * the session proxy. Cookie/requested IDs are hints only and must already
 * appear in the authenticated user's active memberships.
 */
export function resolveLoginOrganizationFromMemberships(input: {
  pathname?: string | null;
  requestedOrganizationId?: string | null;
  cookieOrganizationId?: string | null;
  membershipIds: string[];
}): LoginOrganizationResolution {
  if (isPlatformDestination(input.pathname)) {
    return {
      organizationId: null,
      membershipIds: [],
      needsOrganizationSelection: false,
      audience: "platform",
    };
  }

  const membershipIds = uniqueOrganizationIds(
    input.membershipIds.map((organization_id) => ({ organization_id })),
  );
  const requested = input.requestedOrganizationId?.trim() || null;
  if (requested && membershipIds.includes(requested)) {
    return {
      organizationId: requested,
      membershipIds,
      needsOrganizationSelection: false,
      audience: "organization",
    };
  }

  const cookieId = input.cookieOrganizationId?.trim() || null;
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

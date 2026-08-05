import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ChurchAccessError } from "@/lib/church/errors";
import {
  clearActiveOrganizationCookie,
  readActiveOrganizationCookie,
  writeActiveOrganizationCookie,
} from "@/lib/church/cookie";
import { clearActiveCampusCookie } from "@/lib/campuses/filter-cookie";
import type {
  Church,
  ChurchMembershipWithChurch,
  MembershipRole,
  Profile,
} from "@/lib/church/types";
import {
  canManageCertifications,
  isOwnerRecoveryChurchStatus,
  isOwnershipRole,
  isUsableChurchStatus,
  normalizeMembershipRole,
} from "@/lib/church/types";
import { hasMinRole } from "@/lib/church/navigation";
import { isChurchOperationallyLocked } from "@/lib/church/operations";

type MembershipQueryRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  created_at: string | null;
};

type ChurchQueryRow = {
  id: string;
  name: string;
  status: string | null;
  slug: string | null;
  timezone: string | null;
  week_starts_on?: number | null;
};

export type CurrentUser = {
  user: User;
  profile: Omit<Profile, "organization_id" | "role">;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export type ActiveOrganizationContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profile: Profile;
  /** UI presentation name for the active organization. */
  church: Church;
  membership: ChurchMembershipWithChurch;
  memberships: ChurchMembershipWithChurch[];
  canManageCertifications: boolean;
  /** Persist via Server Action — not written during RSC render. */
  cookieSyncOrganizationId: string | null;
};

/** @deprecated Prefer ActiveOrganizationContext */
export type ActiveChurchContext = ActiveOrganizationContext;

function sortMemberships(
  rows: ChurchMembershipWithChurch[],
): ChurchMembershipWithChurch[] {
  return [...rows].sort((a, b) => {
    const aTime = a.joined_at || a.created_at || "";
    const bTime = b.joined_at || b.created_at || "";
    return aTime.localeCompare(bTime);
  });
}

/** Authenticated Supabase user + profile (no church context). */
export async function getCurrentUser(): Promise<CurrentUser> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new ChurchAccessError(
      "You must be signed in to continue.",
      "UNAUTHENTICATED",
    );
  }

  // Prefer first/last when present (migrations 009+). Fall back if prod DB
  // has not received those columns yet so the app shell still loads.
  let profile: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name: string | null;
  } | null = null;

  const fullSelect = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (fullSelect.error) {
    const missingNameColumns =
      /first_name|last_name/i.test(fullSelect.error.message) &&
      /does not exist|column/i.test(fullSelect.error.message);

    if (missingNameColumns) {
      const legacySelect = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (legacySelect.error) {
        console.error("[getCurrentUser] profiles select failed", {
          code: legacySelect.error.code,
          message: legacySelect.error.message,
          details: legacySelect.error.details,
          hint: legacySelect.error.hint,
        });
        throw new ChurchAccessError(
          `Unable to load your profile. (${legacySelect.error.message})`,
          "LOAD_FAILED",
        );
      }

      profile = legacySelect.data
        ? {
            id: legacySelect.data.id,
            first_name: null,
            last_name: null,
            full_name: legacySelect.data.full_name,
          }
        : null;
    } else {
      console.error("[getCurrentUser] profiles select failed", {
        code: fullSelect.error.code,
        message: fullSelect.error.message,
        details: fullSelect.error.details,
        hint: fullSelect.error.hint,
      });
      throw new ChurchAccessError(
        `Unable to load your profile. (${fullSelect.error.message})`,
        "LOAD_FAILED",
      );
    }
  } else {
    profile = fullSelect.data;
  }

  if (!profile) {
    throw new ChurchAccessError(
      "Your profile has not been created yet. Sign out and back in, or contact support.",
      "NO_PROFILE",
    );
  }

  const fullName =
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    null;

  return {
    supabase,
    user,
    profile: {
      id: profile.id,
      first_name: profile.first_name ?? null,
      last_name: profile.last_name ?? null,
      full_name: fullName,
    },
  };
}

/** All active memberships for usable churches, plus owner recovery for suspended/closed. */
export async function getUserMemberships(
  userId?: string,
): Promise<ChurchMembershipWithChurch[]> {
  const { supabase, user } = userId
    ? { supabase: await createClient(), user: { id: userId } }
    : await getCurrentUser();

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, user_id, role, status, joined_at, created_at")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error("[getUserMemberships] organization_memberships select failed", {
      code: membershipError.code,
      message: membershipError.message,
      details: membershipError.details,
      hint: membershipError.hint,
    });
    throw new ChurchAccessError(
      `Unable to load your church memberships. (${membershipError.message})`,
      "LOAD_FAILED",
    );
  }

  const rows = (memberships ?? []) as MembershipQueryRow[];
  if (rows.length === 0) return [];

  const organizationIds = [...new Set(rows.map((row) => row.organization_id))];
  const { data: churches, error: churchError } = await supabase
    .from("organizations")
    .select("id, name, status, slug, timezone, week_starts_on")
    .in("id", organizationIds);

  if (churchError) {
    // Older DBs without week_starts_on still load; default Sunday in mapping.
    const missingWeekStarts =
      /week_starts_on/i.test(churchError.message) &&
      /does not exist|column/i.test(churchError.message);
    if (!missingWeekStarts) {
      console.error("[getUserMemberships] churches select failed", {
        code: churchError.code,
        message: churchError.message,
        details: churchError.details,
        hint: churchError.hint,
      });
      throw new ChurchAccessError(
        `Unable to load your churches. (${churchError.message})`,
        "LOAD_FAILED",
      );
    }

    const fallback = await supabase
      .from("organizations")
      .select("id, name, status, slug, timezone")
      .in("id", organizationIds);
    if (fallback.error) {
      throw new ChurchAccessError(
        `Unable to load your churches. (${fallback.error.message})`,
        "LOAD_FAILED",
      );
    }
    const churchByIdFallback = new Map(
      ((fallback.data ?? []) as ChurchQueryRow[]).map((church) => [
        church.id,
        church,
      ]),
    );
    const resultFallback: ChurchMembershipWithChurch[] = [];
    for (const row of rows) {
      const church = churchByIdFallback.get(row.organization_id);
      if (!church) continue;
      const role = normalizeMembershipRole(row.role);
      const usable = isUsableChurchStatus(church.status);
      const ownerRecovery =
        isOwnerRecoveryChurchStatus(church.status) && isOwnershipRole(role);
      if (!usable && !ownerRecovery) continue;
      resultFallback.push({
        id: row.id,
        organization_id: row.organization_id,
        user_id: row.user_id,
        role,
        status: "active",
        joined_at: row.joined_at,
        created_at: row.created_at,
        church: {
          id: church.id,
          name: church.name,
          status: church.status as Church["status"],
          slug: church.slug,
          timezone: church.timezone,
          week_starts_on: 0,
        },
      });
    }
    return sortMemberships(resultFallback);
  }

  const churchById = new Map(
    ((churches ?? []) as ChurchQueryRow[]).map((church) => [church.id, church]),
  );

  const result: ChurchMembershipWithChurch[] = [];
  for (const row of rows) {
    const church = churchById.get(row.organization_id);
    if (!church) continue;

    const role = normalizeMembershipRole(row.role);
    const usable = isUsableChurchStatus(church.status);
    const ownerRecovery =
      isOwnerRecoveryChurchStatus(church.status) && isOwnershipRole(role);

    if (!usable && !ownerRecovery) continue;

    result.push({
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role,
      status: "active",
      joined_at: row.joined_at,
      created_at: row.created_at,
      church: {
        id: church.id,
        name: church.name,
        status: church.status as Church["status"],
        slug: church.slug,
        timezone: church.timezone,
        week_starts_on:
          typeof church.week_starts_on === "number" ? church.week_starts_on : 0,
      },
    });
  }

  return sortMemberships(result);
}

/**
 * Resolve the active church from the secure cookie, validated against
 * memberships. Auto-selects when only one membership exists.
 * Invalid cookies are ignored for this request; callers should sync via
 * setActiveChurchForUser / SyncActiveChurchCookie (cookie writes are not
 * allowed during Server Component render).
 */
export async function getActiveOrganization(): Promise<{
  membership: ChurchMembershipWithChurch;
  memberships: ChurchMembershipWithChurch[];
  /** When set, persist this organization id to the httpOnly cookie via a Server Action. */
  cookieSyncOrganizationId: string | null;
}> {
  const memberships = await getUserMemberships();

  if (memberships.length === 0) {
    throw new ChurchAccessError(
      "Your account is not linked to an active church yet.",
      "NO_ACTIVE_MEMBERSHIP",
    );
  }

  const cookieOrganizationId = await readActiveOrganizationCookie();

  if (memberships.length === 1) {
    const only = memberships[0];
    return {
      membership: only,
      memberships,
      cookieSyncOrganizationId:
        cookieOrganizationId !== only.organization_id ? only.organization_id : null,
    };
  }

  const matched = cookieOrganizationId
    ? memberships.find((item) => item.organization_id === cookieOrganizationId)
    : null;

  if (matched) {
    return { membership: matched, memberships, cookieSyncOrganizationId: null };
  }

  // Invalid or missing cookie — prefer an operational org, then any recovery org.
  const fallback =
    memberships.find((item) => !isChurchOperationallyLocked(item.church.status)) ??
    memberships[0];
  return {
    membership: fallback,
    memberships,
    cookieSyncOrganizationId: fallback.organization_id,
  };
}

/** @deprecated Prefer getActiveOrganization */
export const getActiveChurch = getActiveOrganization;

/** Require auth + an active (validated) organization membership. */
export async function requireOrganizationMembership(): Promise<ActiveOrganizationContext> {
  const { supabase, user, profile } = await getCurrentUser();
  const { membership, memberships, cookieSyncOrganizationId } =
    await getActiveOrganization();

  return {
    supabase,
    user,
    profile: {
      ...profile,
      organization_id: membership.organization_id,
      role: membership.role,
    },
    church: membership.church,
    membership,
    memberships,
    canManageCertifications: canManageCertifications(membership.role),
    cookieSyncOrganizationId,
  };
}

/** @deprecated Prefer requireOrganizationMembership */
export const requireChurchMembership = requireOrganizationMembership;

/**
 * Require an organization that is operationally usable (trial/active).
 * Owners of suspended/closed orgs must use recovery routes instead.
 * UI error copy remains church-specific.
 */
export async function requireOperationalOrganization(): Promise<ActiveOrganizationContext> {
  const context = await requireOrganizationMembership();
  if (isChurchOperationallyLocked(context.church.status)) {
    throw new ChurchAccessError(
      context.church.status === "closed"
        ? "This church account is closed. Operational features are unavailable."
        : "This church account is suspended. Operational features are unavailable until an owner reactivates it.",
      "CHURCH_SUSPENDED",
    );
  }
  return context;
}

/** @deprecated Prefer requireOperationalOrganization */
export const requireOperationalChurch = requireOperationalOrganization;

/** Require membership with at least the given role (rank-based). */
export async function requireMinOrganizationRole(
  minimum: MembershipRole,
): Promise<ActiveOrganizationContext> {
  const context = await requireOrganizationMembership();
  if (!hasMinRole(context.membership.role, minimum)) {
    throw new ChurchAccessError(
      "You do not have permission to access this page.",
      "FORBIDDEN_ROLE",
    );
  }
  return context;
}

/** @deprecated Prefer requireMinOrganizationRole */
export const requireMinChurchRole = requireMinOrganizationRole;

/** Require membership plus one of the allowed roles. */
export async function requireOrganizationRole(
  allowedRoles: MembershipRole[],
): Promise<ActiveOrganizationContext> {
  const context = await requireOrganizationMembership();
  if (!allowedRoles.includes(context.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to perform this action.",
      "FORBIDDEN_ROLE",
    );
  }
  return context;
}

/** @deprecated Prefer requireOrganizationRole */
export const requireChurchRole = requireOrganizationRole;

/**
 * Validate a requested organization id against the user's active memberships and
 * persist it in the httpOnly cookie. Never trusts the id without membership proof.
 */
export async function setActiveOrganizationForUser(
  organizationId: string,
): Promise<void> {
  const memberships = await getUserMemberships();
  const match = memberships.find((item) => item.organization_id === organizationId);

  if (!match) {
    await clearActiveOrganizationCookie();
    throw new ChurchAccessError(
      "You do not have access to that church.",
      "FORBIDDEN_ROLE",
    );
  }

  await writeActiveOrganizationCookie(match.organization_id);
  // Campus filter is organization-scoped — reset to All Campuses on switch.
  await clearActiveCampusCookie();
}

/** @deprecated Prefer setActiveOrganizationForUser */
export const setActiveChurchForUser = setActiveOrganizationForUser;

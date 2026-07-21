import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ChurchAccessError } from "@/lib/church/errors";
import {
  clearActiveChurchCookie,
  readActiveChurchCookie,
  writeActiveChurchCookie,
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
  church_id: string;
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
};

export type CurrentUser = {
  user: User;
  profile: Omit<Profile, "church_id" | "role">;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export type ActiveChurchContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: User;
  profile: Profile;
  church: Church;
  membership: ChurchMembershipWithChurch;
  memberships: ChurchMembershipWithChurch[];
  canManageCertifications: boolean;
  /** Persist via Server Action — not written during RSC render. */
  cookieSyncChurchId: string | null;
};

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
    .from("church_memberships")
    .select("id, church_id, user_id, role, status, joined_at, created_at")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error("[getUserMemberships] church_memberships select failed", {
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

  const churchIds = [...new Set(rows.map((row) => row.church_id))];
  const { data: churches, error: churchError } = await supabase
    .from("churches")
    .select("id, name, status, slug, timezone")
    .in("id", churchIds);

  if (churchError) {
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

  const churchById = new Map(
    ((churches ?? []) as ChurchQueryRow[]).map((church) => [church.id, church]),
  );

  const result: ChurchMembershipWithChurch[] = [];
  for (const row of rows) {
    const church = churchById.get(row.church_id);
    if (!church) continue;

    const role = normalizeMembershipRole(row.role);
    const usable = isUsableChurchStatus(church.status);
    const ownerRecovery =
      isOwnerRecoveryChurchStatus(church.status) && isOwnershipRole(role);

    if (!usable && !ownerRecovery) continue;

    result.push({
      id: row.id,
      church_id: row.church_id,
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
export async function getActiveChurch(): Promise<{
  membership: ChurchMembershipWithChurch;
  memberships: ChurchMembershipWithChurch[];
  /** When set, persist this church id to the httpOnly cookie via a Server Action. */
  cookieSyncChurchId: string | null;
}> {
  const memberships = await getUserMemberships();

  if (memberships.length === 0) {
    throw new ChurchAccessError(
      "Your account is not linked to an active church yet.",
      "NO_ACTIVE_MEMBERSHIP",
    );
  }

  const cookieChurchId = await readActiveChurchCookie();

  if (memberships.length === 1) {
    const only = memberships[0];
    return {
      membership: only,
      memberships,
      cookieSyncChurchId:
        cookieChurchId !== only.church_id ? only.church_id : null,
    };
  }

  const matched = cookieChurchId
    ? memberships.find((item) => item.church_id === cookieChurchId)
    : null;

  if (matched) {
    return { membership: matched, memberships, cookieSyncChurchId: null };
  }

  // Invalid or missing cookie — prefer an operational church, then any recovery church.
  const fallback =
    memberships.find((item) => !isChurchOperationallyLocked(item.church.status)) ??
    memberships[0];
  return {
    membership: fallback,
    memberships,
    cookieSyncChurchId: fallback.church_id,
  };
}

/** Require auth + an active (validated) church membership. */
export async function requireChurchMembership(): Promise<ActiveChurchContext> {
  const { supabase, user, profile } = await getCurrentUser();
  const { membership, memberships, cookieSyncChurchId } =
    await getActiveChurch();

  return {
    supabase,
    user,
    profile: {
      ...profile,
      church_id: membership.church_id,
      role: membership.role,
    },
    church: membership.church,
    membership,
    memberships,
    canManageCertifications: canManageCertifications(membership.role),
    cookieSyncChurchId,
  };
}

/**
 * Require a church that is operationally usable (trial/active).
 * Owners of suspended/closed churches must use recovery routes instead.
 */
export async function requireOperationalChurch(): Promise<ActiveChurchContext> {
  const context = await requireChurchMembership();
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

/** Require membership with at least the given role (rank-based). */
export async function requireMinChurchRole(
  minimum: MembershipRole,
): Promise<ActiveChurchContext> {
  const context = await requireChurchMembership();
  if (!hasMinRole(context.membership.role, minimum)) {
    throw new ChurchAccessError(
      "You do not have permission to access this page.",
      "FORBIDDEN_ROLE",
    );
  }
  return context;
}

/** Require membership plus one of the allowed roles. */
export async function requireChurchRole(
  allowedRoles: MembershipRole[],
): Promise<ActiveChurchContext> {
  const context = await requireChurchMembership();
  if (!allowedRoles.includes(context.membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to perform this action.",
      "FORBIDDEN_ROLE",
    );
  }
  return context;
}

/**
 * Validate a requested church id against the user's active memberships and
 * persist it in the httpOnly cookie. Never trusts the id without membership proof.
 */
export async function setActiveChurchForUser(churchId: string): Promise<void> {
  const memberships = await getUserMemberships();
  const match = memberships.find((item) => item.church_id === churchId);

  if (!match) {
    await clearActiveChurchCookie();
    throw new ChurchAccessError(
      "You do not have access to that church.",
      "FORBIDDEN_ROLE",
    );
  }

  await writeActiveChurchCookie(match.church_id);
  // Campus filter is church-scoped — reset to All Campuses on switch.
  await clearActiveCampusCookie();
}

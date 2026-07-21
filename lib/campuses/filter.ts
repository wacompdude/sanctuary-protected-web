import { createClient } from "@/lib/supabase/server";
import { readActiveCampusCookie } from "@/lib/campuses/filter-cookie";
import {
  CAMPUS_FILTER_ALL,
  campusMigrationHintFromError,
} from "@/lib/campuses/constants";
import { hasImplicitAllCampusAccess } from "@/lib/campuses/permissions";
import type { MembershipRole } from "@/lib/church/types";

export type AccessibleCampusOption = {
  id: string;
  name: string;
  short_name: string | null;
  is_primary: boolean;
  status: string;
};

export type CampusFilterSelection = {
  /** `all` = combined authorized campuses; `campus` = one campus. */
  mode: "all" | "campus";
  campusId: string | null;
  campusName: string | null;
  /** Campuses the user may see totals for. */
  accessibleCampuses: AccessibleCampusOption[];
  accessibleCampusIds: string[];
  /** Owner/admin/security_leader — no membership row required. */
  implicitAllAccess: boolean;
  /** Whether campus_memberships / extended schema is available. */
  tablesAvailable: boolean;
};

/**
 * Campuses the current user may include in combined / filtered views.
 * Implicit-access roles get all non-archived campuses for the church.
 */
export async function listAccessibleCampuses(params: {
  churchId: string;
  userId: string;
  role: MembershipRole;
}): Promise<{
  campuses: AccessibleCampusOption[];
  implicitAllAccess: boolean;
  tablesAvailable: boolean;
}> {
  const implicitAllAccess = hasImplicitAllCampusAccess(params.role);
  const supabase = await createClient();

  try {
    if (implicitAllAccess) {
      const { data, error } = await supabase
        .from("campuses")
        .select("id, name, short_name, is_primary, status, archived_at")
        .eq("church_id", params.churchId)
        .order("is_primary", { ascending: false })
        .order("name", { ascending: true });

      if (error) {
        if (campusMigrationHintFromError(error.message)) {
          // Legacy campuses table without extended columns
          const legacy = await supabase
            .from("campuses")
            .select("id, name, status")
            .eq("church_id", params.churchId)
            .order("name", { ascending: true });
          if (legacy.error) {
            return { campuses: [], implicitAllAccess, tablesAvailable: false };
          }
          return {
            campuses: (legacy.data ?? []).map((row) => ({
              id: String(row.id),
              name: String(row.name ?? "Campus"),
              short_name: null,
              is_primary: false,
              status: String(row.status ?? "active"),
            })),
            implicitAllAccess,
            tablesAvailable: true,
          };
        }
        throw new Error(error.message);
      }

      const campuses = (data ?? [])
        .filter(
          (row) =>
            row.status !== "archived" &&
            !(row as { archived_at?: string | null }).archived_at,
        )
        .map((row) => ({
          id: String(row.id),
          name: String(row.name ?? "Campus"),
          short_name: (row.short_name as string | null) ?? null,
          is_primary: Boolean(row.is_primary),
          status: String(row.status ?? "active"),
        }));

      return { campuses, implicitAllAccess, tablesAvailable: true };
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("campus_memberships")
      .select("campus_id")
      .eq("church_id", params.churchId)
      .eq("user_id", params.userId)
      .eq("status", "active");

    if (membershipError) {
      if (campusMigrationHintFromError(membershipError.message)) {
        return { campuses: [], implicitAllAccess, tablesAvailable: false };
      }
      throw new Error(membershipError.message);
    }

    const campusIds = [
      ...new Set(
        (memberships ?? []).map((row) => String(row.campus_id)).filter(Boolean),
      ),
    ];
    if (campusIds.length === 0) {
      return { campuses: [], implicitAllAccess, tablesAvailable: true };
    }

    const { data, error } = await supabase
      .from("campuses")
      .select("id, name, short_name, is_primary, status, archived_at")
      .eq("church_id", params.churchId)
      .in("id", campusIds)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      if (campusMigrationHintFromError(error.message)) {
        return { campuses: [], implicitAllAccess, tablesAvailable: false };
      }
      throw new Error(error.message);
    }

    const campuses = (data ?? [])
      .filter(
        (row) =>
          row.status !== "archived" &&
          !(row as { archived_at?: string | null }).archived_at,
      )
      .map((row) => ({
        id: String(row.id),
        name: String(row.name ?? "Campus"),
        short_name: (row.short_name as string | null) ?? null,
        is_primary: Boolean(row.is_primary),
        status: String(row.status ?? "active"),
      }));

    return { campuses, implicitAllAccess, tablesAvailable: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (campusMigrationHintFromError(message)) {
      return { campuses: [], implicitAllAccess, tablesAvailable: false };
    }
    throw error;
  }
}

/**
 * Resolve the global campus filter from the cookie, validated against
 * accessible campuses. Defaults to All Campuses.
 */
export async function resolveCampusFilter(params: {
  churchId: string;
  userId: string;
  role: MembershipRole;
}): Promise<CampusFilterSelection> {
  const { campuses, implicitAllAccess, tablesAvailable } =
    await listAccessibleCampuses(params);

  const accessibleCampusIds = campuses.map((campus) => campus.id);
  const cookieValue = await readActiveCampusCookie();
  const wantsAll =
    !cookieValue ||
    cookieValue === CAMPUS_FILTER_ALL ||
    cookieValue === "all";

  if (wantsAll) {
    return {
      mode: "all",
      campusId: null,
      campusName: null,
      accessibleCampuses: campuses,
      accessibleCampusIds,
      implicitAllAccess,
      tablesAvailable,
    };
  }

  const matched = campuses.find((campus) => campus.id === cookieValue);
  if (!matched) {
    // Invalid / unauthorized cookie — fall back to All Campuses
    return {
      mode: "all",
      campusId: null,
      campusName: null,
      accessibleCampuses: campuses,
      accessibleCampusIds,
      implicitAllAccess,
      tablesAvailable,
    };
  }

  return {
    mode: "campus",
    campusId: matched.id,
    campusName: matched.name,
    accessibleCampuses: campuses,
    accessibleCampusIds,
    implicitAllAccess,
    tablesAvailable,
  };
}

export function campusFilterLabel(filter: CampusFilterSelection): string {
  if (filter.mode === "campus" && filter.campusName) {
    return filter.campusName;
  }
  return "All Campuses";
}

/**
 * Whether a row with optional campus_id belongs in the current filter.
 * Church-wide rows (`null`) appear in both combined and single-campus views.
 */
export function matchesCampusFilter(
  rowCampusId: string | null | undefined,
  filter: CampusFilterSelection,
): boolean {
  if (filter.mode === "campus") {
    if (rowCampusId == null || rowCampusId === "") return true;
    return rowCampusId === filter.campusId;
  }

  // All Campuses — only authorized campuses (+ church-wide)
  if (rowCampusId == null || rowCampusId === "") return true;
  if (filter.implicitAllAccess) return true;
  if (filter.accessibleCampusIds.length === 0) {
    // No assignments and no implicit access: only church-wide rows
    return false;
  }
  return filter.accessibleCampusIds.includes(rowCampusId);
}

/**
 * Build a PostgREST `.or()` clause for campus-scoped tables.
 * Returns null when no campus filter should be applied (implicit all + All mode).
 */
export function campusFilterOrClause(
  filter: CampusFilterSelection,
): string | null {
  if (filter.mode === "campus" && filter.campusId) {
    return `campus_id.eq.${filter.campusId},campus_id.is.null`;
  }

  if (filter.implicitAllAccess) {
    return null;
  }

  if (filter.accessibleCampusIds.length === 0) {
    return "campus_id.is.null";
  }

  const ids = filter.accessibleCampusIds.join(",");
  return `campus_id.in.(${ids}),campus_id.is.null`;
}

/**
 * Prefer URL campus override when present and authorized; otherwise use the
 * global cookie filter. Always includes church-wide (`null`) rows via Or-clause.
 */
export function resolveListCampusFilterOr(
  filter: CampusFilterSelection,
  urlCampusId?: string | null,
): string | null {
  const url = urlCampusId?.trim() || "";
  if (url && filter.accessibleCampusIds.includes(url)) {
    return `campus_id.eq.${url},campus_id.is.null`;
  }
  return campusFilterOrClause(filter);
}

/** Default campus id for create forms (active filter campus, else empty = church-wide). */
export function defaultCampusIdForForm(
  filter: CampusFilterSelection,
): string {
  return filter.mode === "campus" && filter.campusId ? filter.campusId : "";
}

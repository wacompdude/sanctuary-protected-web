import { createClient } from "@/lib/supabase/server";
import {
  CAMPUS_MIGRATION_HINT,
  campusMigrationHintFromError,
} from "@/lib/campuses/constants";
import {
  canManageCampusMembershipsByCampusRole,
  canManageCampusMembershipsByChurchRole,
  hasImplicitAllCampusAccess,
} from "@/lib/campuses/permissions";
import type {
  CampusMembership,
  CampusMembershipStatus,
  CampusRole,
  OwnCampusMembership,
} from "@/lib/campuses/types";
import type { MembershipRole } from "@/lib/church/types";
import { displayMemberName } from "@/lib/church/team";

const MEMBERSHIP_SELECT = `
  id, church_id, campus_id, church_membership_id, user_id, campus_role,
  status, is_primary_campus, assigned_by, assigned_at, removed_at,
  created_at, updated_at
`;

function mapMembership(row: Record<string, unknown>): CampusMembership {
  return {
    id: String(row.id),
    church_id: String(row.church_id),
    campus_id: String(row.campus_id),
    church_membership_id: String(row.church_membership_id),
    user_id: String(row.user_id),
    campus_role: (row.campus_role as CampusRole) ?? "campus_viewer",
    status: (row.status as CampusMembershipStatus) ?? "active",
    is_primary_campus: Boolean(row.is_primary_campus),
    assigned_by: (row.assigned_by as string | null) ?? null,
    assigned_at: String(row.assigned_at ?? ""),
    removed_at: (row.removed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function areCampusMembershipTablesAvailable(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("campus_memberships")
      .select("id")
      .limit(1);
    if (error) {
      return !campusMigrationHintFromError(error.message);
    }
    return true;
  } catch {
    return false;
  }
}

export async function listCampusMembers(
  churchId: string,
  campusId: string,
  options?: { includeRemoved?: boolean },
): Promise<CampusMembership[]> {
  const supabase = await createClient();
  let query = supabase
    .from("campus_memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("church_id", churchId)
    .eq("campus_id", campusId)
    .order("assigned_at", { ascending: false });

  if (!options?.includeRemoved) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    if (campusMigrationHintFromError(error.message)) return [];
    throw new Error(error.message);
  }

  const members = (data ?? []).map((row) =>
    mapMembership(row as Record<string, unknown>),
  );
  if (members.length === 0) return members;

  const membershipIds = members.map((m) => m.church_membership_id);
  const userIds = [...new Set(members.map((m) => m.user_id))];

  const [{ data: churchMemberships }, { data: profiles }] = await Promise.all([
    supabase
      .from("church_memberships")
      .select("id, role, user_id")
      .eq("church_id", churchId)
      .in("id", membershipIds),
    supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .in("id", userIds),
  ]);

  const roleByMembershipId = new Map(
    (churchMemberships ?? []).map((row) => [
      String(row.id),
      String(row.role ?? ""),
    ]),
  );
  const profileByUserId = new Map(
    (profiles ?? []).map((row) => [String(row.id), row]),
  );

  return members.map((member) => {
    const profile = profileByUserId.get(member.user_id);
    return {
      ...member,
      church_role: roleByMembershipId.get(member.church_membership_id) ?? null,
      display_name: profile
        ? displayMemberName({
            full_name: (profile.full_name as string | null) ?? null,
            first_name: (profile.first_name as string | null) ?? null,
            last_name: (profile.last_name as string | null) ?? null,
          })
        : "Member",
      email: null,
    };
  });
}

export async function getActorCampusMembership(
  churchId: string,
  campusId: string,
  userId: string,
): Promise<CampusMembership | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campus_memberships")
    .select(MEMBERSHIP_SELECT)
    .eq("church_id", churchId)
    .eq("campus_id", campusId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (campusMigrationHintFromError(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapMembership(data as Record<string, unknown>);
}

export async function canActorManageCampusMemberships(params: {
  churchId: string;
  campusId: string;
  userId: string;
  churchRole: MembershipRole;
}): Promise<boolean> {
  if (canManageCampusMembershipsByChurchRole(params.churchRole)) {
    return true;
  }
  const own = await getActorCampusMembership(
    params.churchId,
    params.campusId,
    params.userId,
  );
  return canManageCampusMembershipsByCampusRole(own?.campus_role);
}

export async function listOwnCampusMemberships(
  userId: string,
): Promise<OwnCampusMembership[]> {
  const supabase = await createClient();

  const { data: churchMemberships, error: membershipError } = await supabase
    .from("church_memberships")
    .select("id, church_id, role, status, churches(id, name)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const churchRows = (churchMemberships ?? []) as Array<{
    id: string;
    church_id: string;
    role: string;
    churches:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  }>;

  if (churchRows.length === 0) return [];

  const { data: campusRows, error: campusError } = await supabase
    .from("campus_memberships")
    .select(
      `
      id, church_id, campus_id, campus_role, status, is_primary_campus,
      campuses ( id, name )
    `,
    )
    .eq("user_id", userId)
    .eq("status", "active");

  if (campusError) {
    if (campusMigrationHintFromError(campusError.message)) {
      return churchRows.map((row) => {
        const church = Array.isArray(row.churches)
          ? row.churches[0]
          : row.churches;
        return {
          id: `implicit-${row.id}`,
          church_id: row.church_id,
          church_name: church?.name ?? "Church",
          campus_id: "",
          campus_name: "All campuses (implicit)",
          campus_role: "campus_viewer" as CampusRole,
          is_primary_campus: false,
          status: "active" as const,
          church_role: row.role,
          has_implicit_all_campus_access: hasImplicitAllCampusAccess(
            row.role as MembershipRole,
          ),
        };
      }).filter((row) => row.has_implicit_all_campus_access);
    }
    throw new Error(campusError.message);
  }

  const byChurch = new Map(
    churchRows.map((row) => {
      const church = Array.isArray(row.churches)
        ? row.churches[0]
        : row.churches;
      return [
        row.church_id,
        {
          church_name: church?.name ?? "Church",
          role: row.role,
        },
      ] as const;
    }),
  );

  const explicit: OwnCampusMembership[] = (campusRows ?? []).map((row) => {
    const campus = Array.isArray(row.campuses)
      ? row.campuses[0]
      : row.campuses;
    const church = byChurch.get(String(row.church_id));
    return {
      id: String(row.id),
      church_id: String(row.church_id),
      church_name: church?.church_name ?? "Church",
      campus_id: String(row.campus_id),
      campus_name: (campus as { name?: string } | null)?.name ?? "Campus",
      campus_role: (row.campus_role as CampusRole) ?? "campus_viewer",
      is_primary_campus: Boolean(row.is_primary_campus),
      status: (row.status as CampusMembershipStatus) ?? "active",
      church_role: church?.role ?? "viewer",
      has_implicit_all_campus_access: hasImplicitAllCampusAccess(
        (church?.role as MembershipRole) ?? "viewer",
      ),
    };
  });

  // Add synthetic "all campuses" rows for roles with implicit access when
  // they have no explicit memberships (or always as an info marker).
  const implicitExtras: OwnCampusMembership[] = [];
  for (const [churchId, info] of byChurch) {
    if (!hasImplicitAllCampusAccess(info.role as MembershipRole)) continue;
    const hasExplicit = explicit.some((row) => row.church_id === churchId);
    if (hasExplicit) continue;
    implicitExtras.push({
      id: `implicit-${churchId}`,
      church_id: churchId,
      church_name: info.church_name,
      campus_id: "",
      campus_name: "All campuses",
      campus_role: "campus_administrator",
      is_primary_campus: false,
      status: "active",
      church_role: info.role,
      has_implicit_all_campus_access: true,
    });
  }

  return [...explicit, ...implicitExtras].sort((a, b) =>
    a.church_name.localeCompare(b.church_name) ||
    a.campus_name.localeCompare(b.campus_name),
  );
}

export { CAMPUS_MIGRATION_HINT };

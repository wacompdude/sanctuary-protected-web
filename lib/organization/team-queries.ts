import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import {
  displayMemberName,
  parseMembershipRoleSafe,
  parseMembershipStatus,
  type TeamMemberRow,
} from "@/lib/organization/team";
import {
  filterVisibleChurchMembers,
  loadHiddenPlatformOperatorUserIds,
} from "@/lib/platform/hidden-from-church";

type RpcRow = {
  membership_id: string;
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  updated_at: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url?: string | null;
  is_last_active_owner: boolean;
};

export async function listChurchTeamMemberships(
  organizationId: string,
): Promise<TeamMemberRow[]> {
  const { supabase } = await getAuthenticatedUserWithChurch();

  const { data, error } = await supabase.rpc("list_organization_team_memberships", {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(
      error.message.includes("does not exist")
        ? "Team management is not configured yet. Run supabase/migrations/015_team_management.sql in the Supabase SQL Editor."
        : error.message,
    );
  }

  const hiddenUserIds = await loadHiddenPlatformOperatorUserIds();
  const mapped = ((data ?? []) as RpcRow[]).map((row) => ({
    membershipId: row.membership_id,
    userId: row.user_id,
    name: displayMemberName({
      full_name: row.full_name,
      first_name: row.first_name,
      last_name: row.last_name,
    }),
    email: row.email,
    role: parseMembershipRoleSafe(row.role),
    status: parseMembershipStatus(row.status),
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
    isLastActiveOwner: Boolean(row.is_last_active_owner),
    avatarUrl: row.avatar_url ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: null as string | null,
  }));

  const userIds = mapped.map((row) => row.userId);
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, phone")
      .in("id", userIds);
    const phoneById = new Map(
      ((profiles ?? []) as Array<{ id: string; phone: string | null }>).map(
        (row) => [row.id, row.phone],
      ),
    );
    for (const row of mapped) {
      row.phone = phoneById.get(row.userId) ?? null;
    }
  }

  // Defense in depth: RPC also excludes platform_accounts after migration 066.
  return filterVisibleChurchMembers(mapped, hiddenUserIds);
}

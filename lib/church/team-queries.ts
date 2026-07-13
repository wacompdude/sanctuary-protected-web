import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import {
  displayMemberName,
  parseMembershipRoleSafe,
  parseMembershipStatus,
  type TeamMemberRow,
} from "@/lib/church/team";

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
  is_last_active_owner: boolean;
};

export async function listChurchTeamMemberships(
  churchId: string,
): Promise<TeamMemberRow[]> {
  const { supabase } = await getAuthenticatedUserWithChurch();

  const { data, error } = await supabase.rpc("list_church_team_memberships", {
    p_church_id: churchId,
  });

  if (error) {
    throw new Error(
      error.message.includes("does not exist")
        ? "Team management is not configured yet. Run supabase/migrations/015_team_management.sql in the Supabase SQL Editor."
        : error.message,
    );
  }

  return ((data ?? []) as RpcRow[]).map((row) => ({
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
  }));
}

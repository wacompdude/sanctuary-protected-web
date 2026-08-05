/**
 * lib/security/membership-roles.ts
 * CRUD helpers for organization_membership_roles and organization_role_settings.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipRole } from "@/lib/church/types";
import type {
  ChurchMembershipRoleRow,
  RoleTemplateKind,
} from "./types";

export type ChurchRoleSettingRow = {
  id: string;
  organization_id: string;
  role_kind: RoleTemplateKind;
  role_key: string;
  display_name_override: string | null;
  description_override: string | null;
  status: "active" | "inactive";
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listChurchRoleSettings(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ChurchRoleSettingRow[]> {
  const { data, error } = await admin
    .from("organization_role_settings")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Failed to list church role settings:", error);
    return [];
  }
  return (data || []) as ChurchRoleSettingRow[];
}

export async function upsertChurchRoleSetting(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    roleKind: RoleTemplateKind;
    roleKey: string;
    displayNameOverride?: string | null;
    descriptionOverride?: string | null;
    status?: "active" | "inactive";
    updatedBy: string;
  },
): Promise<ChurchRoleSettingRow | null> {
  const { data, error } = await admin
    .from("organization_role_settings")
    .upsert(
      {
        organization_id: input.organizationId,
        role_kind: input.roleKind,
        role_key: input.roleKey,
        display_name_override: input.displayNameOverride ?? null,
        description_override: input.descriptionOverride ?? null,
        status: input.status ?? "active",
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,role_kind,role_key" },
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to upsert church role setting:", error);
    return null;
  }
  return data as ChurchRoleSettingRow | null;
}

export async function listActiveMembershipRolesForUser(
  admin: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<ChurchMembershipRoleRow[]> {
  const { data, error } = await admin
    .from("organization_membership_roles")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("is_primary", { ascending: false });

  if (error) {
    console.error("Failed to list membership roles:", error);
    return [];
  }
  return (data || []) as ChurchMembershipRoleRow[];
}

export async function listMembersWithRole(
  admin: SupabaseClient,
  organizationId: string,
  roleKey: string,
): Promise<
  Array<{
    membershipRoleId: string;
    membershipId: string;
    userId: string;
    isPrimary: boolean;
    assignedAt: string;
  }>
> {
  const { data, error } = await admin
    .from("organization_membership_roles")
    .select("id, organization_membership_id, user_id, is_primary, assigned_at")
    .eq("organization_id", organizationId)
    .eq("role", roleKey)
    .eq("status", "active");

  if (error) {
    console.error("Failed to list members with role:", error);
    return [];
  }

  return (data || []).map((row) => ({
    membershipRoleId: row.id as string,
    membershipId: row.organization_membership_id as string,
    userId: row.user_id as string,
    isPrimary: Boolean(row.is_primary),
    assignedAt: row.assigned_at as string,
  }));
}

export async function countMembersByPrimaryRole(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Record<string, number>> {
  const { data, error } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .neq("status", "removed");

  if (error) {
    console.error("Failed to count members by role:", error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const role = String(row.role);
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

export async function countMembersByAnyRole(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Record<string, number>> {
  const { data, error } = await admin
    .from("organization_membership_roles")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to count members by any role:", error);
    return {};
  }

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const role = String(row.role);
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

/**
 * Replace secondary roles while keeping / syncing primary on memberships.role.
 */
export async function setMembershipRoles(params: {
  admin: SupabaseClient;
  organizationId: string;
  membershipId: string;
  userId: string;
  primaryRole: MembershipRole;
  secondaryRoles: MembershipRole[];
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    admin,
    organizationId,
    membershipId,
    userId,
    primaryRole,
    secondaryRoles,
    actorUserId,
  } = params;

  const uniqueSecondary = [
    ...new Set(secondaryRoles.filter((role) => role !== primaryRole)),
  ];

  if (primaryRole === "owner" && uniqueSecondary.length > 0) {
    // allow secondary on owner
  }

  // Soft-remove roles no longer assigned
  const desired = new Set<MembershipRole>([primaryRole, ...uniqueSecondary]);
  const existing = await listActiveMembershipRolesForUser(admin, organizationId, userId);

  for (const row of existing) {
    if (!desired.has(row.role as MembershipRole)) {
      const { error } = await admin
        .from("organization_membership_roles")
        .update({
          status: "removed",
          is_primary: false,
          removed_by: actorUserId,
          removed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) {
        return { ok: false, error: error.message };
      }
    }
  }

  // Update primary via memberships.role (trigger syncs junction)
  const { error: membershipError } = await admin
    .from("organization_memberships")
    .update({ role: primaryRole })
    .eq("id", membershipId)
    .eq("organization_id", organizationId);

  if (membershipError) {
    return { ok: false, error: membershipError.message };
  }

  // Ensure secondary rows exist
  for (const role of uniqueSecondary) {
    const active = existing.find(
      (row) => row.role === role && row.status === "active",
    );
    if (active) {
      if (active.is_primary) {
        const { error } = await admin
          .from("organization_membership_roles")
          .update({
            is_primary: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", active.id);
        if (error) return { ok: false, error: error.message };
      }
      continue;
    }

    const { error } = await admin.from("organization_membership_roles").insert({
      organization_id: organizationId,
      organization_membership_id: membershipId,
      user_id: userId,
      role,
      is_primary: false,
      status: "active",
      assigned_by: actorUserId,
    });
    if (error) {
      // If unique conflict from soft-removed row of same role, reactivate
      const { data: prior } = await admin
        .from("organization_membership_roles")
        .select("id")
        .eq("organization_membership_id", membershipId)
        .eq("role", role)
        .maybeSingle();

      if (!prior) return { ok: false, error: error.message };

      const { error: reactivateError } = await admin
        .from("organization_membership_roles")
        .update({
          status: "active",
          is_primary: false,
          removed_at: null,
          removed_by: null,
          assigned_by: actorUserId,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", prior.id);

      if (reactivateError) return { ok: false, error: reactivateError.message };
    }
  }

  return { ok: true };
}

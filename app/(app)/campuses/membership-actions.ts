"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/organization/auth";
import {
  CAMPUS_ROLES,
  campusMigrationHintFromError,
  defaultCampusRoleForChurchRole,
} from "@/lib/campuses/constants";
import {
  assertAssignableCampusRole,
  assertProtectedCampusTarget,
  isTopLevelCampusAdminRole,
} from "@/lib/campuses/campus-policy";
import { requireCampusAction } from "@/lib/campuses/server-auth";
import type { CampusActionState, CampusRole } from "@/lib/campuses/types";
import { createClient } from "@/lib/supabase/server";

function revalidateMembershipPaths(campusId: string) {
  revalidatePath("/campuses");
  revalidatePath(`/campuses/${campusId}`);
  revalidatePath("/profile");
  revalidatePath("/team");
}

async function requireMembershipAction(
  campusId: string,
  action: "members.add" | "members.remove" | "members.manage" | "roles.assign",
) {
  return requireCampusAction(action, { campusId });
}

function parseCampusRole(raw: string): CampusRole | null {
  return CAMPUS_ROLES.some((item) => item.value === raw)
    ? (raw as CampusRole)
    : null;
}

async function loadTargetMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  organizationMembershipId: string,
) {
  const { data } = await supabase
    .from("organization_memberships")
    .select("id, user_id, role, status, organization_id")
    .eq("organization_id", organizationId)
    .eq("id", organizationMembershipId)
    .maybeSingle();
  return data as {
    id: string;
    user_id: string;
    role: string;
    status: string;
    organization_id: string;
  } | null;
}

export async function addCampusMembersAction(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const campusId = String(formData.get("campus_id") ?? "").trim();
    if (!campusId) return { error: "Campus is required." };

    const { user, church, membership } = await requireMembershipAction(
      campusId,
      "members.add",
    );
    const supabase = await createClient();
    const actorIsAdmin = isTopLevelCampusAdminRole(membership.role);

    const membershipIds = formData
      .getAll("membership_ids")
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (membershipIds.length === 0) {
      return { error: "Select at least one member." };
    }

    const roleRaw = String(formData.get("campus_role") ?? "").trim();
    const overrideRole = roleRaw ? parseCampusRole(roleRaw) : null;
    if (roleRaw && !overrideRole) {
      return {
        error: "Select a valid campus role.",
        fieldErrors: { campus_role: "Invalid role." },
      };
    }
    if (overrideRole) {
      const assignable = assertAssignableCampusRole({
        actorIsTopLevelAdmin: actorIsAdmin,
        campusRole: overrideRole,
      });
      if (!assignable.allowed) return { error: assignable.message };
    }

    const makePrimary =
      formData.get("is_primary_campus") === "on" ||
      formData.get("is_primary_campus") === "true" ||
      formData.get("is_primary_campus") === "1";

    const { data: churchMembers, error: memberError } = await supabase
      .from("organization_memberships")
      .select("id, user_id, role, status, organization_id")
      .eq("organization_id", church.id)
      .eq("status", "active")
      .in("id", membershipIds);

    if (memberError) {
      return {
        error:
          campusMigrationHintFromError(memberError.message) ??
          memberError.message,
      };
    }

    const active = (churchMembers ?? []) as Array<{
      id: string;
      user_id: string;
      role: string;
      organization_id: string;
    }>;
    if (active.length === 0) {
      return { error: "No active church members matched the selection." };
    }

    for (const row of active) {
      if (row.organization_id !== church.id) {
        return { error: "You cannot manage members from another church." };
      }
      const protectedTarget = assertProtectedCampusTarget({
        actorIsTopLevelAdmin: actorIsAdmin,
        targetChurchRole: row.role,
      });
      if (!protectedTarget.allowed) {
        await writeAuditLog(supabase, {
          organizationId: church.id,
          userId: user.id,
          action: AuditAction.CAMPUS_PRIVILEGE_ESCALATION_ATTEMPT,
          entityType: AuditEntityType.CAMPUS,
          entityId: campusId,
          metadata: {
            target_user_id: row.user_id,
            target_role: row.role,
            attempted: "members.add",
          },
          ipAddress: await getRequestIpAddress(),
        });
        return { error: protectedTarget.message };
      }

      const campusRole =
        overrideRole ?? defaultCampusRoleForChurchRole(row.role);
      const roleCheck = assertAssignableCampusRole({
        actorIsTopLevelAdmin: actorIsAdmin,
        campusRole,
      });
      if (!roleCheck.allowed) return { error: roleCheck.message };

      const { data: existing } = await supabase
        .from("campus_memberships")
        .select("id, status")
        .eq("campus_id", campusId)
        .eq("organization_membership_id", row.id)
        .maybeSingle();

      const { count: existingActiveCount } = await supabase
        .from("campus_memberships")
        .select("id", { count: "exact", head: true })
        .eq("organization_membership_id", row.id)
        .eq("status", "active");

      const shouldBePrimary =
        makePrimary || (existingActiveCount ?? 0) === 0;

      if (shouldBePrimary) {
        await supabase
          .from("campus_memberships")
          .update({ is_primary_campus: false })
          .eq("organization_membership_id", row.id)
          .eq("status", "active")
          .eq("is_primary_campus", true);
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from("campus_memberships")
          .update({
            status: "active",
            removed_at: null,
            campus_role: campusRole,
            is_primary_campus: shouldBePrimary,
            assigned_by: user.id,
            assigned_at: new Date().toISOString(),
            user_id: row.user_id,
          })
          .eq("id", (existing as { id: string }).id);
        if (updateError) {
          return {
            error:
              campusMigrationHintFromError(updateError.message) ??
              updateError.message,
          };
        }
      } else {
        const { error: insertError } = await supabase
          .from("campus_memberships")
          .insert({
            organization_id: church.id,
            campus_id: campusId,
            organization_membership_id: row.id,
            user_id: row.user_id,
            campus_role: campusRole,
            status: "active",
            is_primary_campus: shouldBePrimary,
            assigned_by: user.id,
            removed_at: null,
          });
        if (insertError && !/duplicate|unique/i.test(insertError.message)) {
          return {
            error:
              campusMigrationHintFromError(insertError.message) ??
              insertError.message,
          };
        }
      }
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_MEMBERSHIP_ADDED,
      entityType: AuditEntityType.CAMPUS,
      entityId: campusId,
      metadata: {
        membership_count: active.length,
        campus_role: overrideRole ?? "per_member_default",
        organization_accounts_deleted: false,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMembershipPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error ? error.message : "Unable to add campus members.",
    };
  }
}

export async function updateCampusMemberRoleAction(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const campusId = String(formData.get("campus_id") ?? "").trim();
    const memberRowId = String(formData.get("member_id") ?? "").trim();
    const role = parseCampusRole(
      String(formData.get("campus_role") ?? "").trim(),
    );
    if (!campusId || !memberRowId || !role) {
      return { error: "Campus member and role are required." };
    }

    const { user, church, membership } = await requireMembershipAction(
      campusId,
      "roles.assign",
    );
    const supabase = await createClient();
    const actorIsAdmin = isTopLevelCampusAdminRole(membership.role);
    const assignable = assertAssignableCampusRole({
      actorIsTopLevelAdmin: actorIsAdmin,
      campusRole: role,
    });
    if (!assignable.allowed) {
      await writeAuditLog(supabase, {
        organizationId: church.id,
        userId: user.id,
        action: AuditAction.CAMPUS_PRIVILEGE_ESCALATION_ATTEMPT,
        entityType: AuditEntityType.CAMPUS,
        entityId: campusId,
        metadata: { attempted_role: role, member_id: memberRowId },
        ipAddress: await getRequestIpAddress(),
      });
      return { error: assignable.message };
    }

    const { data: existing } = await supabase
      .from("campus_memberships")
      .select("id, campus_role, status, organization_membership_id, user_id")
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("organization_id", church.id)
      .maybeSingle();

    if (!existing || existing.status !== "active") {
      return { error: "Campus membership not found." };
    }

    const target = await loadTargetMembership(
      supabase,
      church.id,
      existing.organization_membership_id,
    );
    const protectedTarget = assertProtectedCampusTarget({
      actorIsTopLevelAdmin: actorIsAdmin,
      targetChurchRole: target?.role,
    });
    if (!protectedTarget.allowed) {
      await writeAuditLog(supabase, {
        organizationId: church.id,
        userId: user.id,
        action: AuditAction.CAMPUS_PRIVILEGE_ESCALATION_ATTEMPT,
        entityType: AuditEntityType.CAMPUS,
        entityId: campusId,
        metadata: { target_role: target?.role ?? null, attempted: "roles.assign" },
        ipAddress: await getRequestIpAddress(),
      });
      return { error: protectedTarget.message };
    }

    const { error } = await supabase
      .from("campus_memberships")
      .update({ campus_role: role })
      .eq("id", memberRowId)
      .eq("organization_id", church.id);

    if (error) {
      return {
        error: campusMigrationHintFromError(error.message) ?? error.message,
      };
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_MEMBERSHIP_ROLE_CHANGED,
      entityType: AuditEntityType.CAMPUS_MEMBERSHIP,
      entityId: memberRowId,
      metadata: {
        campus_id: campusId,
        previous_role: existing.campus_role,
        new_role: role,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMembershipPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to update campus role.",
    };
  }
}

export async function setMemberPrimaryCampusAction(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const campusId = String(formData.get("campus_id") ?? "").trim();
    const memberRowId = String(formData.get("member_id") ?? "").trim();
    if (!campusId || !memberRowId) {
      return { error: "Campus membership is required." };
    }

    const { user, church, membership } = await requireMembershipAction(
      campusId,
      "members.manage",
    );
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("campus_memberships")
      .select("id, organization_membership_id, status, is_primary_campus")
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("organization_id", church.id)
      .maybeSingle();

    if (!existing || existing.status !== "active") {
      return { error: "Campus membership not found." };
    }

    const target = await loadTargetMembership(
      supabase,
      church.id,
      existing.organization_membership_id,
    );
    const protectedTarget = assertProtectedCampusTarget({
      actorIsTopLevelAdmin: isTopLevelCampusAdminRole(membership.role),
      targetChurchRole: target?.role,
    });
    if (!protectedTarget.allowed) return { error: protectedTarget.message };

    await supabase
      .from("campus_memberships")
      .update({ is_primary_campus: false })
      .eq("organization_membership_id", existing.organization_membership_id)
      .eq("status", "active")
      .eq("is_primary_campus", true);

    const { error } = await supabase
      .from("campus_memberships")
      .update({ is_primary_campus: true })
      .eq("id", memberRowId)
      .eq("organization_id", church.id);

    if (error) {
      return {
        error: campusMigrationHintFromError(error.message) ?? error.message,
      };
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_MEMBERSHIP_PRIMARY_CHANGED,
      entityType: AuditEntityType.CAMPUS_MEMBERSHIP,
      entityId: memberRowId,
      metadata: { campus_id: campusId, is_primary_campus: true },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMembershipPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to set primary campus.",
    };
  }
}

export async function removeCampusMemberAction(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const campusId = String(formData.get("campus_id") ?? "").trim();
    const memberRowId = String(formData.get("member_id") ?? "").trim();
    const confirmed = String(formData.get("confirm_remove") ?? "").trim();
    if (!campusId || !memberRowId) {
      return { error: "Campus membership is required." };
    }
    if (confirmed !== "1") {
      return {
        error:
          "Confirm removal. This removes the campus assignment only and does not delete the church account.",
      };
    }

    const { user, church, membership } = await requireMembershipAction(
      campusId,
      "members.remove",
    );
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("campus_memberships")
      .select("id, organization_membership_id, user_id, status")
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("organization_id", church.id)
      .maybeSingle();

    if (!existing || existing.status !== "active") {
      return { error: "Campus membership not found." };
    }

    const target = await loadTargetMembership(
      supabase,
      church.id,
      existing.organization_membership_id,
    );
    const protectedTarget = assertProtectedCampusTarget({
      actorIsTopLevelAdmin: isTopLevelCampusAdminRole(membership.role),
      targetChurchRole: target?.role,
    });
    if (!protectedTarget.allowed) {
      await writeAuditLog(supabase, {
        organizationId: church.id,
        userId: user.id,
        action: AuditAction.CAMPUS_PRIVILEGE_ESCALATION_ATTEMPT,
        entityType: AuditEntityType.CAMPUS,
        entityId: campusId,
        metadata: {
          target_user_id: existing.user_id,
          target_role: target?.role ?? null,
          attempted: "members.remove",
        },
        ipAddress: await getRequestIpAddress(),
      });
      return { error: protectedTarget.message };
    }

    const { error } = await supabase
      .from("campus_memberships")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        is_primary_campus: false,
      })
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("organization_id", church.id);

    if (error) {
      return {
        error: campusMigrationHintFromError(error.message) ?? error.message,
      };
    }

    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_MEMBERSHIP_REMOVED,
      entityType: AuditEntityType.CAMPUS_MEMBERSHIP,
      entityId: memberRowId,
      metadata: {
        campus_id: campusId,
        organization_account_deleted: false,
        target_user_id: existing.user_id,
      },
      ipAddress: await getRequestIpAddress(),
    });

    revalidateMembershipPaths(campusId);
    return { success: true, campusId };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove campus member.",
    };
  }
}

export async function searchCampusMemberCandidatesAction(input: {
  campusId: string;
  query: string;
}): Promise<{ members?: Array<{ membershipId: string; name: string; role: string }>; error?: string }> {
  try {
    const campusId = input.campusId.trim();
    if (!campusId) return { error: "Campus is required." };
    await requireMembershipAction(campusId, "members.add");
    const { church } = await getAuthenticatedUserWithChurch();
    const { listChurchTeamMemberships } = await import(
      "@/lib/organization/team-queries"
    );
    const team = await listChurchTeamMemberships(church.id);
    const query = input.query.trim().toLowerCase();
    const members = team
      .filter((row) => row.status === "active")
      .filter((row) => row.userId) // same org only via RPC
      .filter((row) => {
        if (!query) return true;
        return (
          row.name.toLowerCase().includes(query) ||
          (row.email ?? "").toLowerCase().includes(query)
        );
      })
      .slice(0, 50)
      .map((row) => ({
        membershipId: row.membershipId,
        name: row.name,
        role: row.role,
      }));
    return { members };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error: error instanceof Error ? error.message : "Unable to search members.",
    };
  }
}

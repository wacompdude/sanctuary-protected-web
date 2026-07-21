"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import {
  CAMPUS_ROLES,
  campusMigrationHintFromError,
  defaultCampusRoleForChurchRole,
} from "@/lib/campuses/constants";
import { canActorManageCampusMemberships } from "@/lib/campuses/membership-queries";
import type { CampusActionState, CampusRole } from "@/lib/campuses/types";
import { createClient } from "@/lib/supabase/server";

function revalidateMembershipPaths(campusId: string) {
  revalidatePath("/campuses");
  revalidatePath(`/campuses/${campusId}`);
  revalidatePath("/profile");
  revalidatePath("/team");
}

async function requireMembershipManager(campusId: string) {
  const ctx = await getAuthenticatedUserWithChurch();
  const allowed = await canActorManageCampusMemberships({
    churchId: ctx.church.id,
    campusId,
    userId: ctx.user.id,
    churchRole: ctx.membership.role,
  });
  if (!allowed) {
    throw new ChurchAccessError(
      "You do not have permission to manage campus memberships.",
    );
  }
  return ctx;
}

function parseCampusRole(raw: string): CampusRole | null {
  return CAMPUS_ROLES.some((item) => item.value === raw)
    ? (raw as CampusRole)
    : null;
}

export async function addCampusMembersAction(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  try {
    const campusId = String(formData.get("campus_id") ?? "").trim();
    if (!campusId) return { error: "Campus is required." };

    const { user, church } = await requireMembershipManager(campusId);
    const supabase = await createClient();

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

    const makePrimary =
      formData.get("is_primary_campus") === "on" ||
      formData.get("is_primary_campus") === "true" ||
      formData.get("is_primary_campus") === "1";

    const { data: churchMembers, error: memberError } = await supabase
      .from("church_memberships")
      .select("id, user_id, role, status")
      .eq("church_id", church.id)
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
    }>;
    if (active.length === 0) {
      return { error: "No active church members matched the selection." };
    }

    for (const row of active) {
      const campusRole =
        overrideRole ?? defaultCampusRoleForChurchRole(row.role);

      const { data: existing } = await supabase
        .from("campus_memberships")
        .select("id, status")
        .eq("campus_id", campusId)
        .eq("church_membership_id", row.id)
        .maybeSingle();

      const { count: existingActiveCount } = await supabase
        .from("campus_memberships")
        .select("id", { count: "exact", head: true })
        .eq("church_membership_id", row.id)
        .eq("status", "active");

      const shouldBePrimary =
        makePrimary || (existingActiveCount ?? 0) === 0;

      if (shouldBePrimary) {
        await supabase
          .from("campus_memberships")
          .update({ is_primary_campus: false })
          .eq("church_membership_id", row.id)
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
            church_id: church.id,
            campus_id: campusId,
            church_membership_id: row.id,
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
      churchId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_MEMBERSHIP_ADDED,
      entityType: AuditEntityType.CAMPUS,
      entityId: campusId,
      metadata: {
        membership_count: active.length,
        campus_role: overrideRole ?? "per_member_default",
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

    const { user, church } = await requireMembershipManager(campusId);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("campus_memberships")
      .select("id, campus_role, status")
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (!existing || existing.status !== "active") {
      return { error: "Campus membership not found." };
    }

    const { error } = await supabase
      .from("campus_memberships")
      .update({ campus_role: role })
      .eq("id", memberRowId)
      .eq("church_id", church.id);

    if (error) {
      return {
        error: campusMigrationHintFromError(error.message) ?? error.message,
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
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

    const { user, church } = await requireMembershipManager(campusId);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("campus_memberships")
      .select("id, church_membership_id, status, is_primary_campus")
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (!existing || existing.status !== "active") {
      return { error: "Campus membership not found." };
    }

    await supabase
      .from("campus_memberships")
      .update({ is_primary_campus: false })
      .eq("church_membership_id", existing.church_membership_id)
      .eq("status", "active")
      .eq("is_primary_campus", true);

    const { error } = await supabase
      .from("campus_memberships")
      .update({ is_primary_campus: true })
      .eq("id", memberRowId)
      .eq("church_id", church.id);

    if (error) {
      return {
        error: campusMigrationHintFromError(error.message) ?? error.message,
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
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
    if (!campusId || !memberRowId) {
      return { error: "Campus membership is required." };
    }

    const { user, church } = await requireMembershipManager(campusId);
    const supabase = await createClient();

    const { error } = await supabase
      .from("campus_memberships")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        is_primary_campus: false,
      })
      .eq("id", memberRowId)
      .eq("campus_id", campusId)
      .eq("church_id", church.id);

    if (error) {
      return {
        error: campusMigrationHintFromError(error.message) ?? error.message,
      };
    }

    await writeAuditLog(supabase, {
      churchId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_MEMBERSHIP_REMOVED,
      entityType: AuditEntityType.CAMPUS_MEMBERSHIP,
      entityId: memberRowId,
      metadata: { campus_id: campusId },
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

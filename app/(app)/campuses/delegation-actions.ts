"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import { ChurchAccessError } from "@/lib/organization/auth";
import {
  CAMPUS_DELEGATION_TEMPLATES,
  assertNotSelfElevation,
  isTopLevelCampusAdminRole,
  type CampusDelegationTemplateKey,
} from "@/lib/campuses/campus-policy";
import {
  assignCampusDelegation,
  listDelegatedCampusManagers,
  revokeCampusDelegation,
} from "@/lib/campuses/delegation";
import { requireCampusAction } from "@/lib/campuses/server-auth";
import { parseAssignmentInput } from "@/lib/security/group-member-service";
import { logSecurityGroupMemberAdded, logSecurityGroupMemberRevoked } from "@/lib/security/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validateAssignmentDates } from "@/lib/security/group-member-utils";

function revalidateDelegation(campusId: string) {
  revalidatePath("/campuses");
  revalidatePath(`/campuses/${campusId}`);
  revalidatePath("/settings/security");
}

export async function listCampusDelegatedManagersAction(campusId: string, campusName: string) {
  try {
    const { church } = await requireCampusAction("security.manage", { campusId });
    const admin = createAdminClient();
    const managers = await listDelegatedCampusManagers({
      admin,
      organizationId: church.id,
      campusId,
      campusName,
    });
    return { success: true, managers };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load delegated managers.",
    };
  }
}

export async function delegateCampusAccessAction(input: {
  campusId: string;
  campusName: string;
  userId: string;
  templateKey: CampusDelegationTemplateKey;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  assignmentReason?: string | null;
  administrativeNotes?: string | null;
}) {
  try {
    const { user, church, membership } = await requireCampusAction(
      "security.manage",
      { campusId: input.campusId, campusName: input.campusName },
    );
    if (!isTopLevelCampusAdminRole(membership.role)) {
      return {
        error: "Only an Owner, Co-owner, or Administrator can delegate campus access.",
      };
    }

    const selfCheck = assertNotSelfElevation({
      actorUserId: user.id,
      targetUserId: input.userId,
      changingOwnDelegation: input.userId === user.id && !isTopLevelCampusAdminRole(membership.role),
    });
    if (!selfCheck.allowed) return { error: selfCheck.message };

    const template = CAMPUS_DELEGATION_TEMPLATES.find(
      (item) => item.key === input.templateKey,
    );
    if (!template) return { error: "Select an approved delegated campus role." };

    const dates = parseAssignmentInput({
      effectiveAt: input.effectiveAt,
      expiresAt: input.expiresAt,
    });
    if (dates.error) return { error: dates.error };

    const dateError = validateAssignmentDates({
      effectiveAt: dates.effectiveAt,
      expiresAt: dates.expiresAt,
    });
    if (dateError) return { error: dateError };

    const admin = createAdminClient();
    const result = await assignCampusDelegation({
      admin,
      organizationId: church.id,
      campusId: input.campusId,
      actorUserId: user.id,
      targetUserId: input.userId,
      templateKey: input.templateKey,
      effectiveAt: dates.effectiveAt,
      expiresAt: dates.expiresAt,
      assignmentReason: input.assignmentReason ?? null,
      administrativeNotes: input.administrativeNotes ?? null,
    });

    const supabase = await createClient();
    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_DELEGATION_ADDED,
      entityType: AuditEntityType.CAMPUS,
      entityId: input.campusId,
      metadata: {
        target_user_id: input.userId,
        security_group_id: result.group.id,
        role: template.name,
        campus_scope: input.campusName,
        effective_at: dates.effectiveAt,
        expires_at: dates.expiresAt,
        reason: input.assignmentReason ?? null,
      },
      ipAddress: await getRequestIpAddress(),
    });
    await logSecurityGroupMemberAdded(
      admin,
      church.id,
      result.group.id,
      input.userId,
      user.id,
      input.assignmentReason ?? undefined,
    );

    revalidateDelegation(input.campusId);
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error ? error.message : "Unable to delegate campus access.",
    };
  }
}

export async function revokeCampusDelegationAction(input: {
  campusId: string;
  membershipId: string;
  userId: string;
  groupId: string;
  reason?: string | null;
}) {
  try {
    const { user, church } = await requireCampusAction("security.manage", {
      campusId: input.campusId,
    });
    const admin = createAdminClient();
    const ok = await revokeCampusDelegation({
      admin,
      membershipId: input.membershipId,
      actorUserId: user.id,
      reason: input.reason ?? "Campus delegation revoked",
    });
    if (!ok) return { error: "Unable to revoke campus delegation." };

    const supabase = await createClient();
    await writeAuditLog(supabase, {
      organizationId: church.id,
      userId: user.id,
      action: AuditAction.CAMPUS_DELEGATION_REMOVED,
      entityType: AuditEntityType.CAMPUS,
      entityId: input.campusId,
      metadata: {
        target_user_id: input.userId,
        security_group_id: input.groupId,
        reason: input.reason ?? null,
      },
      ipAddress: await getRequestIpAddress(),
    });
    await logSecurityGroupMemberRevoked(
      admin,
      church.id,
      input.groupId,
      input.userId,
      user.id,
      { campus_id: input.campusId, membership_id: input.membershipId },
      input.reason ?? undefined,
    );

    revalidateDelegation(input.campusId);
    return { success: true };
  } catch (error) {
    if (error instanceof ChurchAccessError) return { error: error.message };
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to revoke campus delegation.",
    };
  }
}

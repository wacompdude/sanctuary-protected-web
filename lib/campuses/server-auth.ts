import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/organization/auth";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";
import {
  canManageCampus,
  getCampusCapabilities,
  type CampusAction,
  type CampusAuthResult,
  type CampusCapabilities,
} from "@/lib/campuses/authorization";
import { getActorCampusMembership } from "@/lib/campuses/membership-queries";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function resolveCampusAction(params: {
  actorUserId: string;
  organizationId: string;
  churchRole: string;
  action: CampusAction;
  campusId?: string | null;
  campusName?: string | null;
}): Promise<CampusAuthResult> {
  const admin = isServiceRoleConfigured() ? createAdminClient() : undefined;
  const own = params.campusId
    ? await getActorCampusMembership(
        params.organizationId,
        params.campusId,
        params.actorUserId,
      )
    : null;

  return canManageCampus({
    admin,
    actorUserId: params.actorUserId,
    organizationId: params.organizationId,
    churchRole: params.churchRole,
    campusId: params.campusId,
    campusRole: own?.campus_role,
    campusName: params.campusName,
    action: params.action,
  });
}

export async function requireCampusAction(
  action: CampusAction,
  options?: { campusId?: string | null; campusName?: string | null },
) {
  const ctx = await getAuthenticatedUserWithChurch();
  const result = await resolveCampusAction({
    actorUserId: ctx.user.id,
    organizationId: ctx.church.id,
    churchRole: ctx.membership.role,
    action,
    campusId: options?.campusId,
    campusName: options?.campusName,
  });

  if (!result.allowed) {
    const supabase = await createClient();
    await writeAuditLog(supabase, {
      organizationId: ctx.church.id,
      userId: ctx.user.id,
      action:
        result.reason === "SELF_ELEVATION_DENIED" ||
        result.reason === "ASSIGNABLE_ROLE_DENIED" ||
        result.reason === "PROTECTED_TARGET"
          ? AuditAction.CAMPUS_PRIVILEGE_ESCALATION_ATTEMPT
          : AuditAction.CAMPUS_UNAUTHORIZED_ATTEMPT,
      entityType: AuditEntityType.CAMPUS,
      entityId: options?.campusId ?? ctx.church.id,
      metadata: {
        action,
        reason: result.reason,
        permission: result.permissionKey ?? null,
        campus_name: options?.campusName ?? null,
      },
      ipAddress: await getRequestIpAddress(),
    });
    throw new ChurchAccessError(result.message);
  }

  return { ...ctx, auth: result };
}

export async function loadCampusCapabilities(params: {
  campusId?: string | null;
  campusName?: string | null;
}): Promise<{
  capabilities: CampusCapabilities;
} & Awaited<ReturnType<typeof getAuthenticatedUserWithChurch>>> {
  const ctx = await getAuthenticatedUserWithChurch();
  const admin = isServiceRoleConfigured() ? createAdminClient() : undefined;
  const own = params.campusId
    ? await getActorCampusMembership(
        ctx.church.id,
        params.campusId,
        ctx.user.id,
      )
    : null;
  const capabilities = await getCampusCapabilities({
    admin,
    actorUserId: ctx.user.id,
    organizationId: ctx.church.id,
    churchRole: ctx.membership.role,
    campusId: params.campusId,
    campusRole: own?.campus_role,
    campusName: params.campusName,
  });
  return { ...ctx, capabilities };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

export async function auditSubscriptionCreated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId?: string | null;
    subscriptionId: string;
    planKey: string;
    status: string;
    source?: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId ?? null,
    action:
      params.status === "trialing"
        ? AuditAction.SUBSCRIPTION_TRIAL_STARTED
        : AuditAction.SUBSCRIPTION_CREATED,
    entityType: AuditEntityType.CHURCH_SUBSCRIPTION,
    entityId: params.subscriptionId,
    metadata: {
      plan_key: params.planKey,
      status: params.status,
      source: params.source ?? "system",
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditSubscriptionPlanChanged(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId?: string | null;
    subscriptionId: string;
    oldPlanKey: string | null;
    newPlanKey: string;
    oldStatus?: string | null;
    newStatus?: string | null;
    source?: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId ?? null,
    action: AuditAction.SUBSCRIPTION_PLAN_CHANGED,
    entityType: AuditEntityType.CHURCH_SUBSCRIPTION,
    entityId: params.subscriptionId,
    metadata: {
      old_plan_key: params.oldPlanKey,
      new_plan_key: params.newPlanKey,
      old_status: params.oldStatus ?? null,
      new_status: params.newStatus ?? null,
      source: params.source ?? "system",
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditSubscriptionStatusChanged(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId?: string | null;
    subscriptionId: string;
    oldStatus: string | null;
    newStatus: string;
    planKey?: string | null;
    source?: string;
  },
) {
  const action =
    params.newStatus === "cancelled"
      ? AuditAction.SUBSCRIPTION_CANCELLED
      : params.newStatus === "active" &&
          (params.oldStatus === "cancelled" ||
            params.oldStatus === "expired" ||
            params.oldStatus === "suspended")
        ? AuditAction.SUBSCRIPTION_REACTIVATED
        : params.newStatus === "active"
          ? AuditAction.SUBSCRIPTION_ACTIVATED
          : AuditAction.SUBSCRIPTION_STATUS_CHANGED;

  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId ?? null,
    action,
    entityType: AuditEntityType.CHURCH_SUBSCRIPTION,
    entityId: params.subscriptionId,
    metadata: {
      old_status: params.oldStatus,
      new_status: params.newStatus,
      plan_key: params.planKey ?? null,
      source: params.source ?? "system",
    },
    ipAddress: await getRequestIpAddress(),
  });
}

/**
 * lib/security/audit.ts
 *
 * Security audit logging: immutable records of all security-related actions.
 * All security changes must be logged here for compliance and auditing.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { SecurityAuditEventType, SecurityAuditResult } from "./types";

export interface SecurityAuditLogParams {
  churchId: string;
  campusId?: string | null;
  actorUserId: string;
  targetUserId?: string | null;
  securityGroupId?: string | null;
  permissionDefinitionId?: string | null;
  eventType: SecurityAuditEventType;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  result?: SecurityAuditResult;
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write a security audit log entry.
 * These records are immutable and cannot be modified after creation.
 */
export async function writeSecurityAuditLog(
  admin: SupabaseClient,
  params: SecurityAuditLogParams,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("security_audit_logs")
      .insert({
        organization_id: params.churchId,
        campus_id: params.campusId || null,
        actor_user_id: params.actorUserId,
        target_user_id: params.targetUserId || null,
        security_group_id: params.securityGroupId || null,
        permission_definition_id: params.permissionDefinitionId || null,
        event_type: params.eventType,
        previous_value: params.previousValue || null,
        new_value: params.newValue || null,
        reason: params.reason || null,
        result: params.result || "success",
        failure_reason: params.failureReason || null,
        ip_address: params.ipAddress || null,
        user_agent: params.userAgent || null,
      })
      .select("id");

    if (error) {
      console.error("Failed to write security audit log:", error);
      return null;
    }

    return (data as Array<{ id: string }>)?.[0]?.id || null;
  } catch (error) {
    console.error("Error writing security audit log:", error);
    return null;
  }
}

/**
 * Query security audit logs with filters.
 */
export interface SecurityAuditLogFilters {
  churchId: string;
  startDate?: Date;
  endDate?: Date;
  actorUserId?: string;
  targetUserId?: string;
  eventType?: SecurityAuditEventType;
  securityGroupId?: string;
  result?: SecurityAuditResult;
  limit?: number;
  offset?: number;
}

export async function querySecurityAuditLogs(
  admin: SupabaseClient,
  filters: SecurityAuditLogFilters,
) {
  let query = admin
    .from("security_audit_logs")
    .select(
      `
      id,
      organization_id,
      campus_id,
      actor_user_id,
      target_user_id,
      security_group_id,
      permission_definition_id,
      event_type,
      previous_value,
      new_value,
      reason,
      result,
      failure_reason,
      ip_address,
      user_agent,
      created_at
    `,
      { count: "exact" },
    )
    .eq("organization_id", filters.churchId)
    .order("created_at", { ascending: false });

  if (filters.startDate) {
    query = query.gte("created_at", filters.startDate.toISOString());
  }

  if (filters.endDate) {
    query = query.lte("created_at", filters.endDate.toISOString());
  }

  if (filters.actorUserId) {
    query = query.eq("actor_user_id", filters.actorUserId);
  }

  if (filters.targetUserId) {
    query = query.eq("target_user_id", filters.targetUserId);
  }

  if (filters.eventType) {
    query = query.eq("event_type", filters.eventType);
  }

  if (filters.securityGroupId) {
    query = query.eq("security_group_id", filters.securityGroupId);
  }

  if (filters.result) {
    query = query.eq("result", filters.result);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  if (filters.offset) {
    query = query.range(filters.offset, (filters.offset || 0) + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Failed to query security audit logs:", error);
    return { logs: [], count: 0, error };
  }

  return { logs: data || [], count: count || 0, error: null };
}

/**
 * Log helpers for common security events.
 */

export async function logSecurityGroupCreated(
  admin: SupabaseClient,
  churchId: string,
  groupId: string,
  groupName: string,
  actorUserId: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    eventType: "security_group.created",
    securityGroupId: groupId,
    newValue: { name: groupName },
    reason: `Created security group: ${groupName}`,
  });
}

export async function logSecurityGroupUpdated(
  admin: SupabaseClient,
  churchId: string,
  groupId: string,
  previousValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  actorUserId: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    eventType: "security_group.updated",
    securityGroupId: groupId,
    previousValue,
    newValue,
  });
}

export async function logUserPermissionGranted(
  admin: SupabaseClient,
  churchId: string,
  targetUserId: string,
  permissionKey: string,
  actorUserId: string,
  reason?: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "user_permission.granted",
    newValue: { permission: permissionKey },
    reason: reason || `Granted permission: ${permissionKey}`,
  });
}

export async function logUserPermissionDenied(
  admin: SupabaseClient,
  churchId: string,
  targetUserId: string,
  permissionKey: string,
  actorUserId: string,
  reason?: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "user_permission.denied",
    newValue: { permission: permissionKey },
    reason: reason || `Denied permission: ${permissionKey}`,
  });
}

export async function logUserPermissionRevoked(
  admin: SupabaseClient,
  churchId: string,
  targetUserId: string,
  permissionKey: string,
  actorUserId: string,
  reason?: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "user_permission.revoked",
    newValue: { permission: permissionKey },
    reason: reason || `Revoked permission: ${permissionKey}`,
  });
}

export async function logUserPermissionUpdated(
  admin: SupabaseClient,
  churchId: string,
  targetUserId: string,
  permissionKey: string,
  actorUserId: string,
  previousValue: Record<string, unknown>,
  newValue: Record<string, unknown>,
  reason?: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "user_permission.updated",
    previousValue,
    newValue: { permission: permissionKey, ...newValue },
    reason: reason || `Updated temporary permission: ${permissionKey}`,
  });
}

export async function logSecurityGroupMemberAdded(
  admin: SupabaseClient,
  churchId: string,
  groupId: string,
  targetUserId: string,
  actorUserId: string,
  reason?: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "security_group_member.added",
    securityGroupId: groupId,
    reason: reason || "Added user to security group",
  });
}

export async function logSecurityGroupMemberRemoved(
  admin: SupabaseClient,
  churchId: string,
  groupId: string,
  targetUserId: string,
  actorUserId: string,
  reason?: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "security_group_member.removed",
    securityGroupId: groupId,
    reason: reason || "Removed user from security group",
  });
}

export async function logSecurityAuditLogViewed(
  admin: SupabaseClient,
  churchId: string,
  actorUserId: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    eventType: "security_audit_log.viewed",
    reason: "Viewed security audit log",
  });
}

export async function logAccessPreviewUsed(
  admin: SupabaseClient,
  churchId: string,
  targetUserId: string,
  permissionKey: string,
  actorUserId: string,
) {
  return writeSecurityAuditLog(admin, {
    churchId,
    actorUserId,
    targetUserId,
    eventType: "security.preview_access_used",
    newValue: { permission: permissionKey },
    reason: `Preview access check for permission: ${permissionKey}`,
  });
}

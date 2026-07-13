/**
 * Helpers for church / campus / ownership audit events.
 * Call from future settings mutations — keeps action names consistent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

export async function auditChurchSettingsUpdated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    changedFields: string[];
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.CHURCH_SETTINGS_UPDATED,
    entityType: AuditEntityType.CHURCH,
    entityId: params.churchId,
    metadata: { changed_fields: params.changedFields },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditCampusCreated(
  supabase: SupabaseClient,
  params: { churchId: string; userId: string; campusId: string; name: string },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.CAMPUS_CREATED,
    entityType: AuditEntityType.CAMPUS,
    entityId: params.campusId,
    metadata: { name: params.name },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditCampusUpdated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    campusId: string;
    changedFields: string[];
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.CAMPUS_UPDATED,
    entityType: AuditEntityType.CAMPUS,
    entityId: params.campusId,
    metadata: { changed_fields: params.changedFields },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditOwnershipTransferInitiated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    fromUserId: string;
    toUserId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.OWNERSHIP_TRANSFER_INITIATED,
    entityType: AuditEntityType.CHURCH,
    entityId: params.churchId,
    metadata: {
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditOwnershipTransferCompleted(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    fromUserId: string;
    toUserId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.OWNERSHIP_TRANSFER_COMPLETED,
    entityType: AuditEntityType.CHURCH,
    entityId: params.churchId,
    metadata: {
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditCertificationUpdated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    certificationId: string;
    changedFields: string[];
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.CERTIFICATION_UPDATED,
    entityType: AuditEntityType.CERTIFICATION,
    entityId: params.certificationId,
    metadata: { changed_fields: params.changedFields },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditCertificationArchived(
  supabase: SupabaseClient,
  params: { churchId: string; userId: string; certificationId: string },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.CERTIFICATION_ARCHIVED,
    entityType: AuditEntityType.CERTIFICATION,
    entityId: params.certificationId,
    metadata: {},
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditCertificationDeleted(
  supabase: SupabaseClient,
  params: { churchId: string; userId: string; certificationId: string },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.CERTIFICATION_DELETED,
    entityType: AuditEntityType.CERTIFICATION,
    entityId: params.certificationId,
    metadata: {},
    ipAddress: await getRequestIpAddress(),
  });
}

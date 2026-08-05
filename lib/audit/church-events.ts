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
    organizationId: string;
    userId: string;
    changedFields: string[];
    action?:
      | typeof AuditAction.CHURCH_SETTINGS_UPDATED
      | typeof AuditAction.CHURCH_SETTINGS_GENERAL_UPDATED
      | typeof AuditAction.CHURCH_SETTINGS_CONTACT_UPDATED
      | typeof AuditAction.CHURCH_SETTINGS_ADDRESS_UPDATED
      | typeof AuditAction.CHURCH_SETTINGS_BRANDING_UPDATED
      | typeof AuditAction.CHURCH_SETTINGS_SECURITY_UPDATED
      | typeof AuditAction.CHURCH_SETTINGS_PREFERENCES_UPDATED
      | typeof AuditAction.CHURCH_LOGO_UPDATED;
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: params.action ?? AuditAction.CHURCH_SETTINGS_UPDATED,
    entityType: AuditEntityType.CHURCH,
    entityId: params.organizationId,
    metadata: { changed_fields: params.changedFields },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditChurchAccountStatusChanged(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    fromStatus: string;
    toStatus: string;
  },
) {
  const action =
    params.toStatus === "suspended"
      ? AuditAction.CHURCH_ACCOUNT_SUSPENDED
      : params.toStatus === "closed"
        ? AuditAction.CHURCH_ACCOUNT_CLOSED
        : AuditAction.CHURCH_ACCOUNT_REACTIVATED;

  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action,
    entityType: AuditEntityType.CHURCH,
    entityId: params.organizationId,
    metadata: {
      from_status: params.fromStatus,
      to_status: params.toStatus,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditChurchThreatLevelUpdated(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    threatLevelId: string;
    weekStart: string;
    previousLevel: string | null;
    nextLevel: string;
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.CHURCH_THREAT_LEVEL_UPDATED,
    entityType: AuditEntityType.CHURCH_THREAT_LEVEL,
    entityId: params.threatLevelId,
    metadata: {
      week_start: params.weekStart,
      previous_level: params.previousLevel,
      next_level: params.nextLevel,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditChurchThreatLevelEdited(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    threatLevelId: string;
    weekStart: string;
    previousLevel: string | null;
    nextLevel: string;
    previousWeekStart?: string | null;
    previousNotes?: string | null;
    nextNotes?: string | null;
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.CHURCH_THREAT_LEVEL_EDITED,
    entityType: AuditEntityType.CHURCH_THREAT_LEVEL,
    entityId: params.threatLevelId,
    metadata: {
      week_start: params.weekStart,
      previous_week_start: params.previousWeekStart ?? null,
      previous_level: params.previousLevel,
      next_level: params.nextLevel,
      notes_changed:
        (params.previousNotes ?? null) !== (params.nextNotes ?? null),
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditChurchThreatLevelDeleted(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    threatLevelId: string;
    weekStart: string;
    threatLevel: string;
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.CHURCH_THREAT_LEVEL_DELETED,
    entityType: AuditEntityType.CHURCH_THREAT_LEVEL,
    entityId: params.threatLevelId,
    metadata: {
      week_start: params.weekStart,
      threat_level: params.threatLevel,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditCampusCreated(
  supabase: SupabaseClient,
  params: { organizationId: string; userId: string; campusId: string; name: string },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
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
    organizationId: string;
    userId: string;
    campusId: string;
    changedFields: string[];
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
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
    organizationId: string;
    userId: string;
    fromUserId: string;
    toUserId: string;
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.OWNERSHIP_TRANSFER_INITIATED,
    entityType: AuditEntityType.CHURCH,
    entityId: params.organizationId,
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
    organizationId: string;
    userId: string;
    fromUserId: string;
    toUserId: string;
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.OWNERSHIP_TRANSFER_COMPLETED,
    entityType: AuditEntityType.CHURCH,
    entityId: params.organizationId,
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
    organizationId: string;
    userId: string;
    certificationId: string;
    changedFields: string[];
  },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
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
  params: { organizationId: string; userId: string; certificationId: string },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
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
  params: { organizationId: string; userId: string; certificationId: string },
) {
  return writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.CERTIFICATION_DELETED,
    entityType: AuditEntityType.CERTIFICATION,
    entityId: params.certificationId,
    metadata: {},
    ipAddress: await getRequestIpAddress(),
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { writeAuditLog } from "@/lib/audit/log";

type AuditClient = SupabaseClient;

export async function auditTrainingEventCreated(
  supabase: AuditClient,
  params: {
    organizationId: string;
    userId: string;
    eventId: string;
    name: string;
    ipAddress?: string | null;
  },
) {
  await writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.TRAINING_EVENT_CREATED,
    entityType: AuditEntityType.TRAINING_EVENT,
    entityId: params.eventId,
    metadata: { name: params.name },
    ipAddress: params.ipAddress ?? null,
  });
}

export async function auditTrainingEventUpdated(
  supabase: AuditClient,
  params: {
    organizationId: string;
    userId: string;
    eventId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
) {
  await writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.TRAINING_EVENT_UPDATED,
    entityType: AuditEntityType.TRAINING_EVENT,
    entityId: params.eventId,
    metadata: params.metadata ?? {},
    ipAddress: params.ipAddress ?? null,
  });
}

export async function auditTrainingEventCancelled(
  supabase: AuditClient,
  params: {
    organizationId: string;
    userId: string;
    eventId: string;
    ipAddress?: string | null;
  },
) {
  await writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.TRAINING_EVENT_CANCELLED,
    entityType: AuditEntityType.TRAINING_EVENT,
    entityId: params.eventId,
    metadata: {},
    ipAddress: params.ipAddress ?? null,
  });
}

export async function auditTrainingCompletionRecorded(
  supabase: AuditClient,
  params: {
    organizationId: string;
    userId: string;
    completionRecordId: string;
    participantId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
) {
  await writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.TRAINING_COMPLETION_RECORDED,
    entityType: AuditEntityType.TRAINING_COMPLETION_RECORD,
    entityId: params.completionRecordId,
    metadata: {
      participant_id: params.participantId ?? null,
      ...params.metadata,
    },
    ipAddress: params.ipAddress ?? null,
  });
}

export async function auditTrainingSettingsUpdated(
  supabase: AuditClient,
  params: {
    organizationId: string;
    userId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
) {
  await writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.TRAINING_SETTINGS_UPDATED,
    entityType: AuditEntityType.TRAINING_SETTINGS,
    entityId: params.organizationId,
    metadata: params.metadata ?? {},
    ipAddress: params.ipAddress ?? null,
  });
}

export async function auditTrainingExternalVerified(
  supabase: AuditClient,
  params: {
    organizationId: string;
    userId: string;
    externalRecordId: string;
    completionRecordId?: string | null;
    ipAddress?: string | null;
  },
) {
  await writeAuditLog(supabase, {
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.TRAINING_EXTERNAL_VERIFIED,
    entityType: AuditEntityType.TRAINING_EXTERNAL_RECORD,
    entityId: params.externalRecordId,
    metadata: { completion_record_id: params.completionRecordId ?? null },
    ipAddress: params.ipAddress ?? null,
  });
}

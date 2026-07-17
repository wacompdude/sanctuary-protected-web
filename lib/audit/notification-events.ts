import type { SupabaseClient } from "@supabase/supabase-js";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { getRequestIpAddress, writeAuditLog } from "@/lib/audit/log";

export async function auditNotificationCreated(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    notificationId: string;
    notificationType: string;
    severity: string;
    recipientCount: number;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_CREATED,
    entityType: AuditEntityType.NOTIFICATION,
    entityId: params.notificationId,
    metadata: {
      notification_type: params.notificationType,
      severity: params.severity,
      recipient_count: params.recipientCount,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditNotificationQueued(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    notificationId: string;
    deliveryCount: number;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_QUEUED,
    entityType: AuditEntityType.NOTIFICATION,
    entityId: params.notificationId,
    metadata: { delivery_count: params.deliveryCount },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditNotificationCancelled(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    notificationId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_CANCELLED,
    entityType: AuditEntityType.NOTIFICATION,
    entityId: params.notificationId,
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditNotificationAcknowledged(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    notificationId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_ACKNOWLEDGED,
    entityType: AuditEntityType.NOTIFICATION,
    entityId: params.notificationId,
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditNotificationDeliverySent(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    deliveryId: string;
    notificationId: string;
    channel: string;
    provider: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_DELIVERY_SENT,
    entityType: AuditEntityType.NOTIFICATION_DELIVERY,
    entityId: params.deliveryId,
    metadata: {
      notification_id: params.notificationId,
      channel: params.channel,
      provider: params.provider,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditNotificationDeliveryFailed(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    deliveryId: string;
    notificationId: string;
    channel: string;
    errorCode?: string | null;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_DELIVERY_FAILED,
    entityType: AuditEntityType.NOTIFICATION_DELIVERY,
    entityId: params.deliveryId,
    metadata: {
      notification_id: params.notificationId,
      channel: params.channel,
      error_code: params.errorCode ?? null,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditNotificationTestEmailSent(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    notificationId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.NOTIFICATION_TEST_EMAIL_SENT,
    entityType: AuditEntityType.NOTIFICATION,
    entityId: params.notificationId,
    ipAddress: await getRequestIpAddress(),
  });
}

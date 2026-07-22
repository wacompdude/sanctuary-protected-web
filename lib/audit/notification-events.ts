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

export async function auditEmailSenderTestSent(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    notificationId: string;
    senderCategory: string;
    deliveryId?: string | null;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.EMAIL_SENDER_TEST_SENT,
    entityType: AuditEntityType.EMAIL_SENDER,
    entityId: params.notificationId,
    metadata: {
      sender_category: params.senderCategory,
      notification_type: "notification.test",
      delivery_id: params.deliveryId ?? null,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditEmailSenderTestFailed(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    senderCategory: string;
    errorCode?: string | null;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.EMAIL_SENDER_TEST_FAILED,
    entityType: AuditEntityType.EMAIL_SENDER,
    entityId: params.churchId,
    metadata: {
      sender_category: params.senderCategory,
      error_code: params.errorCode ?? null,
    },
    ipAddress: await getRequestIpAddress(),
  });
}

export async function auditEmailSenderConfigurationViewed(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
  },
) {
  return writeAuditLog(supabase, {
    churchId: params.churchId,
    userId: params.userId,
    action: AuditAction.EMAIL_SENDER_CONFIGURATION_VIEWED,
    entityType: AuditEntityType.EMAIL_SENDER,
    entityId: params.churchId,
    metadata: { viewed: true },
    ipAddress: await getRequestIpAddress(),
  });
}

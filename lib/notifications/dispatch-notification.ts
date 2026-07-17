import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider } from "@/lib/notifications/providers/email-provider";
import { safeErrorMessage } from "@/lib/notifications/validation";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";

type DeliveryRow = {
  id: string;
  church_id: string;
  notification_id: string;
  recipient_id: string;
  channel: string;
  provider: string;
  status: string;
  attempt_number: number;
  max_attempts: number;
  scheduled_for: string | null;
};

type NotificationMeta = {
  id: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  status: string;
};

type RecipientMeta = {
  id: string;
  recipient_address: string | null;
  display_name: string | null;
};

const BACKOFF_MINUTES = [1, 5, 15];

function nextBackoffMinutes(attemptNumber: number): number {
  return BACKOFF_MINUTES[Math.min(attemptNumber, BACKOFF_MINUTES.length - 1)] ?? 15;
}

export async function dispatchPendingDeliveries(options?: {
  limit?: number;
  notificationId?: string;
  supabase?: SupabaseClient;
}): Promise<{
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
}> {
  if (!isServiceRoleConfigured()) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: "SUPABASE_SERVICE_ROLE_KEY is required to dispatch deliveries.",
    };
  }

  const admin = options?.supabase ?? createAdminClient();
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const nowIso = new Date().toISOString();

  let query = admin
    .from("notification_deliveries")
    .select(
      "id, church_id, notification_id, recipient_id, channel, provider, status, attempt_number, max_attempts, scheduled_for",
    )
    .in("status", ["pending", "queued"])
    .eq("channel", "email")
    .order("scheduled_for", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (options?.notificationId) {
    query = query.eq("notification_id", options.notificationId);
  }

  const { data: deliveries, error } = await query;
  if (error) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: error.message,
    };
  }

  const due = ((deliveries ?? []) as DeliveryRow[]).filter((delivery) => {
    if (!delivery.scheduled_for) return true;
    return delivery.scheduled_for <= nowIso;
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of due) {
    const result = await sendEmailDelivery(admin, delivery);
    if (result === "sent") sent += 1;
    else if (result === "failed") failed += 1;
    else skipped += 1;
  }

  // Refresh parent notification statuses for touched notifications.
  const notificationIds = [...new Set(due.map((row) => row.notification_id))];
  for (const notificationId of notificationIds) {
    await refreshNotificationStatus(admin, notificationId);
  }

  return {
    processed: due.length,
    sent,
    failed,
    skipped,
  };
}

export async function sendEmailDelivery(
  admin: SupabaseClient,
  delivery: DeliveryRow,
): Promise<"sent" | "failed" | "skipped"> {
  if (delivery.channel !== "email") return "skipped";

  const attempt = delivery.attempt_number + 1;
  await admin
    .from("notification_deliveries")
    .update({
      status: "processing",
      attempt_number: attempt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id)
    .in("status", ["pending", "queued"]);

  const [{ data: notification }, { data: recipient }] = await Promise.all([
    admin
      .from("notifications")
      .select("id, title, body, metadata, status")
      .eq("id", delivery.notification_id)
      .maybeSingle(),
    admin
      .from("notification_recipients")
      .select("id, recipient_address, display_name")
      .eq("id", delivery.recipient_id)
      .maybeSingle(),
  ]);

  const notificationRow = notification as NotificationMeta | null;
  const recipientRow = recipient as RecipientMeta | null;

  if (!notificationRow || notificationRow.status === "cancelled") {
    await admin
      .from("notification_deliveries")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return "skipped";
  }

  const to = recipientRow?.recipient_address?.trim();
  if (!to) {
    await admin
      .from("notification_deliveries")
      .update({
        status: "suppressed",
        failed_at: new Date().toISOString(),
        last_error_code: "missing_email",
        last_error_message: "Recipient has no verified email address.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return "skipped";
  }

  const metadata = (notificationRow.metadata ?? {}) as Record<string, unknown>;
  const subject =
    (typeof metadata.email_subject === "string" && metadata.email_subject) ||
    notificationRow.title;
  const text =
    (typeof metadata.email_text === "string" && metadata.email_text) ||
    notificationRow.body;
  const html =
    typeof metadata.email_html === "string" ? metadata.email_html : null;

  // Personalize recipient name in body when possible.
  const personalizedText = text.replace(
    /\{\{\s*recipient_name\s*\}\}/g,
    recipientRow?.display_name ?? "there",
  );
  const personalizedHtml = html?.replace(
    /\{\{\s*recipient_name\s*\}\}/g,
    recipientRow?.display_name ?? "there",
  );

  const { data: settings } = await admin
    .from("church_notification_settings")
    .select("default_sender_name, reply_to_email")
    .eq("church_id", delivery.church_id)
    .maybeSingle();

  const provider = getEmailProvider();
  const sendResult = await provider.send({
    to,
    toName: recipientRow?.display_name,
    subject,
    text: personalizedText,
    html: personalizedHtml,
    fromName:
      (settings as { default_sender_name?: string | null } | null)
        ?.default_sender_name ?? undefined,
    replyTo:
      (settings as { reply_to_email?: string | null } | null)?.reply_to_email ??
      undefined,
    tags: {
      notification_id: delivery.notification_id,
      delivery_id: delivery.id,
    },
  });

  if (sendResult.ok) {
    await admin
      .from("notification_deliveries")
      .update({
        status: sendResult.status === "delivered" ? "delivered" : "sent",
        provider: provider.name,
        provider_message_id: sendResult.providerMessageId ?? null,
        sent_at: new Date().toISOString(),
        delivered_at:
          sendResult.status === "delivered" ? new Date().toISOString() : null,
        provider_response: sendResult.providerResponse ?? {},
        last_error_code: null,
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return "sent";
  }

  const permanent =
    sendResult.status === "rejected" ||
    sendResult.status === "bounced" ||
    sendResult.status === "suppressed" ||
    attempt >= delivery.max_attempts;

  if (permanent) {
    await admin
      .from("notification_deliveries")
      .update({
        status: sendResult.status === "failed" ? "failed" : sendResult.status,
        provider: provider.name,
        failed_at: new Date().toISOString(),
        last_error_code: sendResult.errorCode ?? "send_failed",
        last_error_message: safeErrorMessage(sendResult.errorMessage),
        provider_response: sendResult.providerResponse ?? {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return "failed";
  }

  const retryAt = new Date();
  retryAt.setMinutes(retryAt.getMinutes() + nextBackoffMinutes(attempt));
  await admin
    .from("notification_deliveries")
    .update({
      status: "queued",
      provider: provider.name,
      scheduled_for: retryAt.toISOString(),
      last_error_code: sendResult.errorCode ?? "temporary_failure",
      last_error_message: safeErrorMessage(sendResult.errorMessage),
      provider_response: sendResult.providerResponse ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id);

  return "failed";
}

export async function retryFailedDelivery(params: {
  deliveryId: string;
  churchId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isServiceRoleConfigured()) {
    return {
      ok: false,
      error: "Service role is required to retry deliveries.",
    };
  }

  const admin = createAdminClient();
  const { data: delivery, error } = await admin
    .from("notification_deliveries")
    .select(
      "id, church_id, notification_id, recipient_id, channel, provider, status, attempt_number, max_attempts, scheduled_for",
    )
    .eq("id", params.deliveryId)
    .eq("church_id", params.churchId)
    .maybeSingle();

  if (error || !delivery) {
    return { ok: false, error: error?.message ?? "Delivery not found." };
  }

  const row = delivery as DeliveryRow;
  if (row.status === "sent" || row.status === "delivered") {
    return { ok: false, error: "Delivery already succeeded." };
  }
  if (row.channel !== "email") {
    return { ok: false, error: "Only email deliveries can be retried." };
  }

  await admin
    .from("notification_deliveries")
    .update({
      status: "pending",
      scheduled_for: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  const result = await sendEmailDelivery(admin, {
    ...row,
    status: "pending",
    attempt_number: row.attempt_number,
  });
  await refreshNotificationStatus(admin, row.notification_id);

  return result === "sent"
    ? { ok: true }
    : { ok: false, error: "Retry did not succeed." };
}

async function refreshNotificationStatus(
  admin: SupabaseClient,
  notificationId: string,
) {
  const { data: deliveries } = await admin
    .from("notification_deliveries")
    .select("status, channel")
    .eq("notification_id", notificationId);

  const rows = (deliveries ?? []) as Array<{ status: string; channel: string }>;
  if (rows.length === 0) {
    await admin
      .from("notifications")
      .update({ status: "sent", completed_at: new Date().toISOString() })
      .eq("id", notificationId);
    return;
  }

  const emailRows = rows.filter((row) => row.channel === "email");
  const relevant = emailRows.length > 0 ? emailRows : rows;
  const pending = relevant.some((row) =>
    ["pending", "queued", "processing"].includes(row.status),
  );
  const anySent = relevant.some((row) =>
    ["sent", "delivered"].includes(row.status),
  );
  const anyFailed = relevant.some((row) =>
    ["failed", "bounced", "rejected"].includes(row.status),
  );

  let status = "processing";
  let completedAt: string | null = null;
  if (pending) {
    status = anySent ? "partially_sent" : "queued";
  } else if (anySent && anyFailed) {
    status = "partially_sent";
    completedAt = new Date().toISOString();
  } else if (anySent) {
    status = "sent";
    completedAt = new Date().toISOString();
  } else if (anyFailed) {
    status = "failed";
    completedAt = new Date().toISOString();
  } else {
    status = "sent";
    completedAt = new Date().toISOString();
  }

  await admin
    .from("notifications")
    .update({
      status,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationId);
}

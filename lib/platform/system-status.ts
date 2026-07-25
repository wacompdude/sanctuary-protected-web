import { billingProviderStatusMessage, getBillingProvider } from "@/lib/billing";
import { getEmailSenderRegistryStatus } from "@/lib/email/sender-registry-status";
import { getEmailProviderStatus } from "@/lib/notifications/providers/email-provider";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";

export type PlatformProviderConfigStatus = {
  billing: {
    requested: string;
    providerId: string;
    configured: boolean;
    message: string;
    capabilities: {
      checkout: boolean;
      customerPortal: boolean;
      webhooks: boolean;
      cancelAtProvider: boolean;
    };
  };
  email: {
    provider: string;
    configured: boolean;
    domain: string | null;
    senderSystemConfigured: boolean;
    sendersConfigured: number;
    sendersErrored: number;
  };
  webhooks: {
    billingEndpoint: string;
    resendEndpoint: string;
    resendSecretConfigured: boolean;
  };
  serviceRoleConfigured: boolean;
  cronRoutes: Array<{ path: string; purpose: string }>;
};

export async function getPlatformProviderConfigStatus(): Promise<PlatformProviderConfigStatus> {
  await requirePlatformPermission("developer.config_status.read");
  const billing = getBillingProvider();
  const email = getEmailProviderStatus();
  const senders = getEmailSenderRegistryStatus();

  return {
    billing: {
      requested: process.env.BILLING_PROVIDER?.trim() || "none",
      providerId: billing.id,
      configured: billing.isConfigured(),
      message: billingProviderStatusMessage(),
      capabilities: billing.capabilities(),
    },
    email: {
      provider: email.provider,
      configured: email.configured,
      domain: email.emailDomain,
      senderSystemConfigured: email.senderSystemConfigured,
      sendersConfigured: senders.configuredCount,
      sendersErrored: senders.errorCount,
    },
    webhooks: {
      billingEndpoint: "/api/billing/webhooks/[provider]",
      resendEndpoint: "/api/notifications/webhooks/resend",
      resendSecretConfigured: Boolean(
        process.env.RESEND_WEBHOOK_SECRET?.trim() ||
          process.env.NOTIFICATION_WEBHOOK_SECRET?.trim(),
      ),
    },
    serviceRoleConfigured: isServiceRoleConfigured(),
    cronRoutes: [
      {
        path: "/api/notifications/dispatch",
        purpose: "Dispatch queued notification deliveries",
      },
      {
        path: "/api/notifications/schedule/scan",
        purpose: "Hourly schedule reminders / unfilled shifts",
      },
      {
        path: "/api/notifications/certifications/scan",
        purpose: "Daily certification expiration warnings",
      },
    ],
  };
}

export async function listPlatformJobDeliveries(limit = 50): Promise<{
  counts: Record<string, number>;
  rows: Array<{
    id: string;
    church_id: string;
    channel: string;
    provider: string;
    status: string;
    attempt_number: number;
    scheduled_for: string | null;
    last_error_message: string | null;
    created_at: string;
  }>;
}> {
  await requirePlatformPermission("system.jobs.read");
  const admin = requirePlatformAdminClient();

  const { data, error } = await admin
    .from("notification_deliveries")
    .select(
      "id, church_id, channel, provider, status, attempt_number, scheduled_for, last_error_message, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const status = String(row.status ?? "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
  }

  // Broader counts for pending/failed in last 7 days (cheap aggregates).
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: pendingCount }, { count: failedCount }] = await Promise.all([
    admin
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "queued", "processing"])
      .gte("created_at", since),
    admin
      .from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "bounced", "rejected"])
      .gte("created_at", since),
  ]);

  return {
    counts: {
      ...counts,
      pending_7d: pendingCount ?? 0,
      failed_7d: failedCount ?? 0,
    },
    rows: (data ?? []).map((row) => ({
      id: String(row.id),
      church_id: String(row.church_id),
      channel: String(row.channel),
      provider: String(row.provider),
      status: String(row.status),
      attempt_number: Number(row.attempt_number ?? 0),
      scheduled_for: (row.scheduled_for as string | null) ?? null,
      last_error_message: (row.last_error_message as string | null) ?? null,
      created_at: String(row.created_at),
    })),
  };
}

export async function listPlatformWebhookEvents(limit = 40): Promise<{
  billing: Array<{
    id: string;
    billing_provider: string;
    event_type: string;
    processing_status: string;
    church_id: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    provider: string;
    event_type: string;
    provider_event_id: string | null;
    processed_at: string | null;
    created_at: string;
  }>;
}> {
  await requirePlatformPermission("system.webhooks.read");
  const admin = requirePlatformAdminClient();

  const [billingRes, notifRes] = await Promise.all([
    admin
      .from("billing_events")
      .select(
        "id, billing_provider, event_type, processing_status, church_id, error_message, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("notification_provider_events")
      .select(
        "id, provider, event_type, provider_event_id, processed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  if (billingRes.error) throw new Error(billingRes.error.message);
  // notification_provider_events may be missing on older DBs — tolerate.
  const notifications = notifRes.error ? [] : (notifRes.data ?? []);

  return {
    billing: (billingRes.data ?? []).map((row) => ({
      id: String(row.id),
      billing_provider: String(row.billing_provider),
      event_type: String(row.event_type),
      processing_status: String(row.processing_status),
      church_id: (row.church_id as string | null) ?? null,
      error_message: (row.error_message as string | null) ?? null,
      created_at: String(row.created_at),
    })),
    notifications: notifications.map((row) => ({
      id: String(row.id),
      provider: String(row.provider),
      event_type: String(row.event_type),
      provider_event_id: (row.provider_event_id as string | null) ?? null,
      processed_at: (row.processed_at as string | null) ?? null,
      created_at: String(row.created_at),
    })),
  };
}

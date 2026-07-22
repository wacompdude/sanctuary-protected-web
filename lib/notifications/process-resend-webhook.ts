import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { verifyResendWebhookSignature } from "@/lib/email/verify-resend-webhook";

type ResendWebhookEvent = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    from?: string;
    to?: string[] | string;
    subject?: string;
    bounce?: { message?: string };
    [key: string]: unknown;
  };
};

const EVENT_STATUS_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "queued",
  "email.bounced": "bounced",
  "email.complained": "rejected",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

function getWebhookSecret(): string | null {
  return (
    process.env.RESEND_WEBHOOK_SECRET?.trim() ||
    process.env.NOTIFICATION_WEBHOOK_SECRET?.trim() ||
    null
  );
}

function sanitizePayload(event: ResendWebhookEvent): Record<string, unknown> {
  return {
    type: event.type ?? null,
    created_at: event.created_at ?? null,
    data: {
      email_id: event.data?.email_id ?? null,
      subject: event.data?.subject ?? null,
      // Do not store full recipient lists or body content.
      to_count: Array.isArray(event.data?.to)
        ? event.data.to.length
        : event.data?.to
          ? 1
          : 0,
      bounce_message:
        typeof event.data?.bounce?.message === "string"
          ? event.data.bounce.message.slice(0, 300)
          : null,
    },
  };
}

export async function processResendWebhook(params: {
  rawBody: string;
  headers: Headers;
}): Promise<{ ok: boolean; status: number; error?: string; duplicate?: boolean }> {
  const secret = getWebhookSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Webhook secret is not configured.",
    };
  }

  if (!isServiceRoleConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Service role is required to process webhooks.",
    };
  }

  const svixId = params.headers.get("svix-id")?.trim() ?? "";
  const svixTimestamp = params.headers.get("svix-timestamp")?.trim() ?? "";
  const svixSignature = params.headers.get("svix-signature")?.trim() ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, status: 400, error: "Missing webhook signature headers." };
  }

  const valid = verifyResendWebhookSignature({
    payload: params.rawBody,
    svixId,
    svixTimestamp,
    svixSignature,
    secret,
  });
  if (!valid) {
    return { ok: false, status: 400, error: "Invalid webhook signature." };
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(params.rawBody) as ResendWebhookEvent;
  } catch {
    return { ok: false, status: 400, error: "Invalid webhook JSON." };
  }

  const eventType = String(event.type ?? "").trim();
  const providerMessageId =
    typeof event.data?.email_id === "string" ? event.data.email_id.trim() : "";

  if (!eventType) {
    return { ok: false, status: 400, error: "Missing event type." };
  }

  const admin = createAdminClient();

  // Idempotent insert keyed by provider + svix event id.
  const { data: inserted, error: insertError } = await admin
    .from("notification_provider_events")
    .insert({
      provider: "resend",
      provider_event_id: svixId,
      event_type: eventType,
      provider_message_id: providerMessageId || null,
      payload: sanitizePayload(event),
      processed_at: null,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (
      insertError.code === "23505" ||
      /duplicate|unique/i.test(insertError.message)
    ) {
      return { ok: true, status: 200, duplicate: true };
    }
    console.error("[email] webhook event insert failed:", insertError.message);
    return { ok: false, status: 500, error: "Unable to store webhook event." };
  }

  if (providerMessageId) {
    await applyDeliveryStatusFromWebhook(admin, {
      providerMessageId,
      eventType,
      eventRowId: (inserted as { id?: string } | null)?.id ?? null,
    });
  } else if (inserted?.id) {
    await admin
      .from("notification_provider_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", inserted.id);
  }

  return { ok: true, status: 200 };
}

async function applyDeliveryStatusFromWebhook(
  admin: SupabaseClient,
  params: {
    providerMessageId: string;
    eventType: string;
    eventRowId: string | null;
  },
) {
  const nextStatus = EVENT_STATUS_MAP[params.eventType];
  const { data: delivery } = await admin
    .from("notification_deliveries")
    .select("id, church_id, status")
    .eq("provider", "resend")
    .eq("provider_message_id", params.providerMessageId)
    .maybeSingle();

  if (params.eventRowId) {
    await admin
      .from("notification_provider_events")
      .update({
        delivery_id: (delivery as { id?: string } | null)?.id ?? null,
        church_id: (delivery as { church_id?: string } | null)?.church_id ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", params.eventRowId);
  }

  if (!delivery || !nextStatus) return;

  const current = String((delivery as { status?: string }).status ?? "");
  // Do not regress a terminal success/failure based on earlier lifecycle events.
  if (
    (current === "delivered" && nextStatus !== "complained" && nextStatus !== "bounced") ||
    current === "bounced" ||
    current === "rejected"
  ) {
    return;
  }

  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: new Date().toISOString(),
  };
  if (nextStatus === "delivered") {
    patch.delivered_at = new Date().toISOString();
  }
  if (nextStatus === "bounced" || nextStatus === "failed" || nextStatus === "rejected") {
    patch.failed_at = new Date().toISOString();
    patch.last_error_code = params.eventType;
    patch.last_error_message = `Provider webhook: ${params.eventType}`;
  }

  await admin
    .from("notification_deliveries")
    .update(patch)
    .eq("id", (delivery as { id: string }).id);
}

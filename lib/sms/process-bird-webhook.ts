import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { recordSmsConsentEvent } from "@/lib/sms/consent";
import { inspectMobileNumber, maskMobileE164, normalizeMobileE164 } from "@/lib/sms/phone";
import { getBirdSmsFromNumber } from "@/lib/sms/bird-send";
import { sendSmsHelpReply } from "@/lib/sms/verify";
import {
  birdWebhookDeliveryId,
  classifyInboundSmsKeyword,
  extractBirdWebhookEvent,
  isBirdSmsLifecycleEvent,
  verifyBirdWebhookRequest,
  type BirdWebhookEvent,
  type InboundSmsKeyword,
} from "@/lib/sms/bird-webhook";

function getBirdWebhookSecret(): string | null {
  return process.env.BIRD_WEBHOOK_SECRET?.trim() || null;
}

function applicationHelpReplyEnabled(): boolean {
  return (process.env.SMS_HELP_REPLY ?? "").trim().toLowerCase() === "true";
}

type EndpointRow = {
  id: string;
  organization_id: string;
  user_id: string;
  consent_status: string;
  is_verified: boolean;
  status: string;
  normalized_destination: string;
  suppressed_at?: string | null;
};

const LIFECYCLE_STATUS: Record<string, string> = {
  "sms.accepted": "queued",
  "sms.sent": "sent",
  "sms.delivered": "delivered",
  "sms.failed": "failed",
  "sms.expired": "expired",
  "sms.rejected": "rejected",
};

const TERMINAL_STATUSES = new Set([
  "delivered",
  "failed",
  "rejected",
  "expired",
  "bounced",
  "cancelled",
  "suppressed",
]);

function deliveryStatusRank(status: string): number {
  switch (status) {
    case "pending":
      return 0;
    case "queued":
      return 1;
    case "processing":
      return 2;
    case "sent":
      return 3;
    case "delivered":
    case "failed":
    case "rejected":
    case "expired":
    case "bounced":
    case "cancelled":
    case "suppressed":
      return 4;
    default:
      return 0;
  }
}

function sameE164(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = left ? normalizeMobileE164(left) : null;
  const b = right ? normalizeMobileE164(right) : null;
  return Boolean(a && b && a === b);
}

function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return inspectMobileNumber(raw).e164 ?? normalizeMobileE164(raw);
}

function eventIdForStore(headers: Headers, event: BirdWebhookEvent): string {
  const headerId = birdWebhookDeliveryId(headers);
  if (headerId) return headerId.slice(0, 200);
  const parts = [
    event.type ?? "unknown",
    event.smsId ?? event.suppressionId ?? event.preferenceId ?? "none",
    event.timestamp ?? "none",
  ];
  return parts.join(":").slice(0, 200);
}

function sanitizeBirdPayload(event: BirdWebhookEvent, keyword: InboundSmsKeyword) {
  return {
    type: event.type,
    timestamp: event.timestamp,
    sms_id: event.smsId,
    suppression_id: event.suppressionId,
    preference_id: event.preferenceId,
    channel: event.channel,
    coverage: event.coverage,
    topic_id: event.topicId,
    error_code: event.errorCode,
    keyword,
    from_masked: event.from ? maskMobileE164(event.from) : null,
    to_masked: event.to ? maskMobileE164(event.to) : null,
    destination_masked: event.suppressionDestination
      ? maskMobileE164(event.suppressionDestination)
      : null,
  };
}

export async function processBirdWebhook(params: {
  rawBody: string;
  headers: Headers;
}): Promise<{ ok: boolean; status: number; error?: string; duplicate?: boolean }> {
  const secret = getBirdWebhookSecret();
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

  if (
    !verifyBirdWebhookRequest({
      payload: params.rawBody,
      secret,
      headers: params.headers,
    })
  ) {
    return { ok: false, status: 401, error: "Invalid webhook signature." };
  }

  let payload: unknown = {};
  if (params.rawBody.trim()) {
    try {
      payload = JSON.parse(params.rawBody) as unknown;
    } catch {
      return { ok: false, status: 400, error: "Invalid JSON payload." };
    }
  }

  const event = extractBirdWebhookEvent(payload);
  const type = event.type ?? "unknown";
  const keyword =
    type === "sms.received" ? classifyInboundSmsKeyword(event.body) : null;
  console.info("Bird webhook received:", type);

  const admin = createAdminClient();
  const storedEventId = eventIdForStore(params.headers, event);
  const claimed = await claimBirdProviderEvent(admin, {
    eventId: storedEventId,
    eventType: type,
    providerMessageId: event.smsId,
    payload: sanitizeBirdPayload(event, keyword),
  });
  if (claimed.duplicate) {
    return { ok: true, status: 200, duplicate: true };
  }

  try {
    if (isBirdSmsLifecycleEvent(type)) {
      await handleSmsLifecycle(admin, event, claimed.rowId);
    } else if (type === "sms.received") {
      await handleSmsReceived(admin, event, keyword);
    } else if (type === "sms_suppression.created") {
      await handleSmsSuppression(admin, event);
    } else if (
      type === "preference.granted" ||
      type === "preference.revoked" ||
      type === "preference.deleted"
    ) {
      console.info(
        "Bird preference event acknowledged without consent change:",
        type,
      );
    } else {
      console.info("Unknown Bird event safely ignored:", type);
    }

    if (claimed.rowId) {
      await admin
        .from("notification_provider_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", claimed.rowId);
    }
  } catch (error) {
    console.error(
      "Bird webhook processing failed:",
      type,
      error instanceof Error ? error.message : "unknown error",
    );
    return { ok: false, status: 500, error: "Unable to process webhook event." };
  }

  return { ok: true, status: 200 };
}

async function claimBirdProviderEvent(
  admin: SupabaseClient,
  params: {
    eventId: string;
    eventType: string;
    providerMessageId: string | null;
    payload: Record<string, unknown>;
  },
): Promise<{ duplicate: boolean; rowId: string | null }> {
  const { data, error } = await admin
    .from("notification_provider_events")
    .insert({
      provider: "bird",
      provider_event_id: params.eventId,
      event_type: params.eventType,
      provider_message_id: params.providerMessageId,
      payload: params.payload,
      processed_at: null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { duplicate: true, rowId: null };
    }
    if (/does not exist|schema cache/i.test(error.message)) {
      return { duplicate: false, rowId: null };
    }
    console.error("Bird webhook event insert failed:", error.message);
    return { duplicate: false, rowId: null };
  }
  return { duplicate: false, rowId: (data as { id?: string } | null)?.id ?? null };
}

async function handleSmsLifecycle(
  admin: SupabaseClient,
  event: BirdWebhookEvent,
  eventRowId: string | null,
) {
  const smsId = event.smsId;
  if (!smsId) {
    console.info("Bird delivery status ignored: missing sms_id");
    return;
  }

  const { data: delivery } = await admin
    .from("notification_deliveries")
    .select("id, organization_id, status")
    .eq("provider", "bird")
    .eq("provider_message_id", smsId)
    .maybeSingle();

  if (eventRowId) {
    await admin
      .from("notification_provider_events")
      .update({
        delivery_id: (delivery as { id?: string } | null)?.id ?? null,
        organization_id:
          (delivery as { organization_id?: string } | null)?.organization_id ?? null,
      })
      .eq("id", eventRowId);
  }

  if (!delivery) {
    console.info(
      "Bird delivery status ignored: no matching notification delivery for sms_id",
    );
    return;
  }

  const nextStatus =
    event.type === "sms.undelivered"
      ? null
      : LIFECYCLE_STATUS[event.type ?? ""];
  const current = String((delivery as { status?: string }).status ?? "");
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (event.type === "sms.undelivered") {
    patch.last_error_code = event.errorCode ?? "undelivered";
    patch.last_error_message = (
      event.errorDescription ?? "Carrier reported a temporary non-delivery."
    ).slice(0, 1000);
    console.info("Bird delivery status updated");
  } else if (nextStatus) {
    if (TERMINAL_STATUSES.has(current) && nextStatus !== current) {
      return;
    }
    if (current === "delivered" && nextStatus !== "delivered") {
      return;
    }
    // Bird may send sms.accepted after the API already stored status=sent.
    // Never regress sent → queued or the dispatcher would resend.
    if (deliveryStatusRank(nextStatus) < deliveryStatusRank(current)) {
      return;
    }
    patch.status = nextStatus;
    if (nextStatus === "delivered") {
      patch.delivered_at = new Date().toISOString();
    }
    if (nextStatus === "failed" || nextStatus === "rejected" || nextStatus === "expired") {
      patch.failed_at = new Date().toISOString();
      patch.last_error_code = event.errorCode ?? event.type;
      if (event.errorDescription) {
        patch.last_error_message = event.errorDescription.slice(0, 1000);
      }
    }
    console.info("Bird delivery status updated");
  }

  await admin
    .from("notification_deliveries")
    .update(patch)
    .eq("id", (delivery as { id: string }).id);
}

async function handleSmsReceived(
  admin: SupabaseClient,
  event: BirdWebhookEvent,
  keyword: InboundSmsKeyword,
) {
  const ourSender = getBirdSmsFromNumber();
  if (event.to && ourSender && !sameE164(event.to, ourSender)) {
    console.info(
      "Bird inbound SMS ignored: destination is not the Sanctuary sender",
    );
    return;
  }

  const phoneE164 = toE164(event.from);
  if (!phoneE164) {
    console.info("Bird inbound SMS ignored: originating number could not be normalized");
    return;
  }

  if (!keyword) {
    console.info(
      "Bird inbound SMS safely ignored:",
      maskMobileE164(phoneE164),
    );
    return;
  }

  const endpoints = await findSmsEndpointsByPhone(admin, phoneE164);
  if (endpoints.length === 0) {
    console.info(
      "Bird inbound SMS did not match existing profile:",
      maskMobileE164(phoneE164),
    );
    return;
  }

  if (keyword === "STOP") {
    console.info(
      "Bird STOP keyword received; waiting for sms_suppression.created as the consent source",
    );
    return;
  }

  if (keyword === "START") {
    console.info(
      "Bird START received; application SMS re-enrollment stays on Profile SMS",
    );
    return;
  }

  if (keyword === "HELP") {
    for (const endpoint of endpoints) {
      await recordSmsConsentEvent({
        supabase: admin,
        organizationId: endpoint.organization_id,
        userId: endpoint.user_id,
        endpointId: endpoint.id,
        phoneE164,
        eventType: "HELP_REQUESTED",
        source: "SMS_KEYWORD",
      });
    }
    if (applicationHelpReplyEnabled()) {
      await sendSmsHelpReply(phoneE164);
    }
  }
}

async function handleSmsSuppression(admin: SupabaseClient, event: BirdWebhookEvent) {
  console.info("Bird suppression received");
  const ourSender = getBirdSmsFromNumber();
  const originator = event.suppressionOriginator;
  if (ourSender && originator && !sameE164(originator, ourSender)) {
    console.info(
      "Bird suppression ignored: originator is not the Sanctuary sender",
    );
    return;
  }
  if (ourSender && !originator) {
    console.info(
      "Bird suppression ignored: originator missing, cannot confirm Sanctuary sender",
    );
    return;
  }

  const phoneE164 = toE164(event.suppressionDestination ?? event.from);
  if (!phoneE164) {
    console.info("Bird suppression ignored: destination could not be normalized");
    return;
  }

  const endpoints = await findSmsEndpointsByPhone(admin, phoneE164);
  if (endpoints.length === 0) {
    console.info(
      "Bird suppression did not match existing profile:",
      maskMobileE164(phoneE164),
    );
    return;
  }

  console.info(
    "Bird suppression matched existing profile:",
    maskMobileE164(phoneE164),
  );

  const now = new Date().toISOString();
  for (const endpoint of endpoints) {
    const alreadyStopped =
      endpoint.consent_status === "revoked" &&
      (endpoint.status === "disabled" || Boolean(endpoint.suppressed_at));
    if (alreadyStopped) {
      continue;
    }

    await admin
      .from("notification_endpoints")
      .update({
        consent_status: "revoked",
        consent_source: "SMS_KEYWORD",
        status: "disabled",
        suppressed_at: now,
        suppression_source: "BIRD_SUPPRESSION",
      })
      .eq("id", endpoint.id);

    await recordSmsConsentEvent({
      supabase: admin,
      organizationId: endpoint.organization_id,
      userId: endpoint.user_id,
      endpointId: endpoint.id,
      phoneE164,
      eventType: "SMS_SUPPRESSED",
      source: "SMS_KEYWORD",
      metadata: {
        webhook_type: event.type,
        suppression_id: event.suppressionId,
        sms_opted_in: false,
        sms_opt_out_timestamp: now,
        previous_consent_preserved: true,
      },
    });
    await writeAuditLog(admin, {
      organizationId: endpoint.organization_id,
      userId: endpoint.user_id,
      action: AuditAction.NOTIFICATION_SMS_OPTED_OUT,
      entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
      entityId: endpoint.id,
      metadata: { source: "BIRD_SUPPRESSION" },
    });
  }
}

async function findSmsEndpointsByPhone(
  admin: SupabaseClient,
  phoneE164: string,
): Promise<EndpointRow[]> {
  const { data, error } = await admin
    .from("notification_endpoints")
    .select(
      "id, organization_id, user_id, consent_status, is_verified, status, normalized_destination, suppressed_at",
    )
    .eq("channel", "sms")
    .eq("normalized_destination", phoneE164)
    .neq("status", "revoked");

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data ?? []) as EndpointRow[];
}

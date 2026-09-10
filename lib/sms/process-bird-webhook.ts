import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";
import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { recordSmsConsentEvent } from "@/lib/sms/consent";
import { inspectMobileNumber } from "@/lib/sms/phone";
import { sendSmsEnrollmentConfirmation, sendSmsHelpReply } from "@/lib/sms/verify";
import {
  classifyInboundSmsKeyword,
  extractBirdWebhookEvent,
  verifyBirdWebhookRequest,
  type InboundSmsKeyword,
} from "@/lib/sms/bird-webhook";

function getBirdWebhookSecret(): string | null {
  return process.env.BIRD_WEBHOOK_SECRET?.trim() || null;
}

type EndpointRow = {
  id: string;
  organization_id: string;
  user_id: string;
  consent_status: string;
  is_verified: boolean;
  status: string;
  normalized_destination: string;
};

export async function processBirdWebhook(params: {
  rawBody: string;
  headers: Headers;
}): Promise<{ ok: boolean; status: number; error?: string }> {
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
  const inspected = event.from ? inspectMobileNumber(event.from) : null;
  const phoneE164 = inspected?.e164 ?? null;
  if (!phoneE164) {
    return { ok: true, status: 200 };
  }

  let keyword: InboundSmsKeyword = null;
  const smsChannel =
    !event.channel || event.channel === "sms" || event.channel === "text";
  if (smsChannel && event.preference === "revoked") keyword = "STOP";
  else if (smsChannel && event.preference === "granted") keyword = "START";
  else keyword = classifyInboundSmsKeyword(event.body);

  if (!keyword) {
    return { ok: true, status: 200 };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_endpoints")
    .select(
      "id, organization_id, user_id, consent_status, is_verified, status, normalized_destination",
    )
    .eq("channel", "sms")
    .eq("normalized_destination", phoneE164)
    .neq("status", "revoked");

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      if (keyword === "HELP" && process.env.SMS_HELP_REPLY !== "false") {
        await sendSmsHelpReply(phoneE164);
      }
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 500, error: "Unable to update SMS consent." };
  }

  const endpoints = (data ?? []) as EndpointRow[];
  const now = new Date().toISOString();
  let sendOptInConfirm = false;

  for (const endpoint of endpoints) {
    if (keyword === "STOP") {
      await admin
        .from("notification_endpoints")
        .update({
          consent_status: "revoked",
          consent_recorded_at: now,
          consent_source: "SMS_KEYWORD",
          status: "disabled",
          suppressed_at: now,
          suppression_source: "SMS_KEYWORD",
        })
        .eq("id", endpoint.id);
      await recordSmsConsentEvent({
        supabase: admin,
        organizationId: endpoint.organization_id,
        userId: endpoint.user_id,
        endpointId: endpoint.id,
        phoneE164,
        eventType: "SMS_OPTED_OUT",
        source: "SMS_KEYWORD",
        metadata: { webhook_type: event.type },
      });
      await writeAuditLog(admin, {
        organizationId: endpoint.organization_id,
        userId: endpoint.user_id,
        action: AuditAction.NOTIFICATION_SMS_OPTED_OUT,
        entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
        entityId: endpoint.id,
        metadata: { source: "SMS_KEYWORD" },
      });
    }

    if (keyword === "START") {
      const previouslyConsented =
        endpoint.consent_status === "granted" ||
        endpoint.consent_status === "revoked" ||
        endpoint.consent_status === "pending";
      if (!previouslyConsented) {
        continue;
      }
      const verified = Boolean(endpoint.is_verified);
      await admin
        .from("notification_endpoints")
        .update({
          consent_status: verified ? "granted" : "pending",
          consent_source: "SMS_KEYWORD",
          consent_recorded_at: now,
          status: verified ? "active" : "unverified",
          suppressed_at: null,
          suppression_source: null,
        })
        .eq("id", endpoint.id);
      if (verified) sendOptInConfirm = true;
      await recordSmsConsentEvent({
        supabase: admin,
        organizationId: endpoint.organization_id,
        userId: endpoint.user_id,
        endpointId: endpoint.id,
        phoneE164,
        eventType: "SMS_REOPTED_IN",
        source: "SMS_KEYWORD",
        metadata: { previous_opt_out_preserved: true },
      });
      await writeAuditLog(admin, {
        organizationId: endpoint.organization_id,
        userId: endpoint.user_id,
        action: AuditAction.NOTIFICATION_SMS_OPTED_IN,
        entityType: AuditEntityType.NOTIFICATION_ENDPOINT,
        entityId: endpoint.id,
        metadata: { source: "SMS_KEYWORD", reopt_in: true },
      });
    }

    if (keyword === "HELP") {
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
  }

  if (keyword === "HELP" && process.env.SMS_HELP_REPLY !== "false") {
    await sendSmsHelpReply(phoneE164);
  }
  if (keyword === "START" && sendOptInConfirm) {
    await sendSmsEnrollmentConfirmation(phoneE164);
  }

  return { ok: true, status: 200 };
}

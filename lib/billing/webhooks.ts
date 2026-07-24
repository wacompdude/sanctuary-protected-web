import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize";
import { getBillingProvider } from "@/lib/billing/provider";
import type { BillingWebhookReceiveResult } from "@/lib/billing/types";

/**
 * Receive a provider webhook with signature verification (provider-specific)
 * and idempotent persistence in billing_events.
 */
export async function processBillingWebhook(input: {
  providerSlug: string;
  rawBody: string;
  headers: Headers;
}): Promise<BillingWebhookReceiveResult> {
  if (!isServiceRoleConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Server is missing SUPABASE_SERVICE_ROLE_KEY for billing webhooks.",
    };
  }

  const provider = getBillingProvider();
  if (
    provider.id !== "none" &&
    input.providerSlug.trim().toLowerCase() !== provider.id
  ) {
    return {
      ok: false,
      status: 400,
      error: `Webhook provider "${input.providerSlug}" does not match configured provider.`,
    };
  }

  const parsed = await provider.verifyAndParseWebhook({
    rawBody: input.rawBody,
    headers: input.headers,
  });

  if (!parsed.ok) {
    return {
      ok: false,
      status: parsed.status,
      error: parsed.error ?? "Webhook rejected.",
    };
  }

  const admin = createAdminClient();
  const metadata = sanitizeAuditMetadata(parsed.metadata ?? {});
  const providerEventId = parsed.providerEventId?.trim() || null;

  if (providerEventId) {
    const { data: existing } = await admin
      .from("billing_events")
      .select("id, processing_status")
      .eq("billing_provider", provider.id === "none" ? input.providerSlug : provider.id)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (existing) {
      return {
        ok: true,
        status: 200,
        duplicate: true,
        eventId: String(existing.id),
        normalizedType: parsed.eventType,
      };
    }
  }

  const billingProvider =
    provider.id === "none" ? input.providerSlug.trim().toLowerCase() : provider.id;

  const { data: inserted, error } = await admin
    .from("billing_events")
    .insert({
      church_id: parsed.churchId ?? null,
      billing_provider: billingProvider || "unknown",
      provider_event_id: providerEventId,
      event_type: parsed.eventType,
      processing_status: "received",
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" && providerEventId) {
      return {
        ok: true,
        status: 200,
        duplicate: true,
        eventId: null,
        normalizedType: parsed.eventType,
      };
    }
    console.error("billing webhook insert failed:", error.message);
    return {
      ok: false,
      status: 500,
      error: "Unable to persist billing event.",
    };
  }

  // Provider-specific handlers will mark processed/ignored once adapters exist.
  await admin
    .from("billing_events")
    .update({
      processing_status: "ignored",
      processed_at: new Date().toISOString(),
      error_message:
        "No provider handler installed; event stored for idempotency only.",
    })
    .eq("id", inserted.id);

  return {
    ok: true,
    status: 200,
    duplicate: false,
    eventId: String(inserted.id),
    normalizedType: parsed.eventType,
  };
}

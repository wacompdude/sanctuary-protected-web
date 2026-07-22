import { NextResponse } from "next/server";
import { processResendWebhook } from "@/lib/notifications/process-resend-webhook";

/**
 * Resend webhook receiver.
 * Configure in Resend dashboard → Webhooks:
 *   URL: https://<app>/api/notifications/webhooks/resend
 *   Secret: RESEND_WEBHOOK_SECRET (or NOTIFICATION_WEBHOOK_SECRET)
 *
 * Delivery status is matched by provider_message_id only — never by From address.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await processResendWebhook({
    rawBody,
    headers: request.headers,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Webhook rejected." },
      { status: result.status },
    );
  }

  return NextResponse.json(
    { ok: true, duplicate: Boolean(result.duplicate) },
    { status: 200 },
  );
}

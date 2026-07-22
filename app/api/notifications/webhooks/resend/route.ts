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

import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('svix-signature') || req.headers.get('resend-signature');

  // Guard: Confirm invalid signature returns 400
  if (!signature || !webhookSecret) {
    return new NextResponse('Missing signature headers or secret', { status: 400 });
  }

  try {
    // Verify webhook payload integrity using Resend SDK
    const event = resend.webhooks.constructEvent({
      payload,
      headers: { 'svix-signature': signature },
      secret: webhookSecret,
    });

    const { type, data } = event;

    // Process delivery history status updates
    switch (type) {
      case 'email.delivered':
        console.log(`Webhook Update: Email ${data.email_id} marked as DELIVERED`);
        // TODO: Update database record status to 'DELIVERED'
        break;
      case 'email.bounced':
        console.log(`Webhook Update: Email ${data.email_id} marked as BOUNCED`);
        // TODO: Update database record status to 'BOUNCED'
        break;
      default:
        console.log(`Unhandled event type: ${type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Return 400 Bad Request for signature failures
    return new NextResponse('Invalid signature verification failed', { status: 400 });
  }
}


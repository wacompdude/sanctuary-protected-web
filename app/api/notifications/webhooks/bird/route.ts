import { NextResponse } from "next/server";
import { processBirdWebhook } from "@/lib/sms/process-bird-webhook";

/**
 * Bird SMS / preference webhook receiver.
 * Configure in Bird → Developers → Webhooks:
 *   URL: https://<app>/api/notifications/webhooks/bird
 *   Secret: BIRD_WEBHOOK_SECRET (Standard Webhooks whsec_… value)
 */

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "bird-webhook",
      methods: ["POST"],
    },
    {
      status: 200,
      headers: { Allow: "GET, HEAD, POST, OPTIONS" },
    },
  );
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { Allow: "GET, HEAD, POST, OPTIONS" },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, HEAD, POST, OPTIONS" },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await processBirdWebhook({
    rawBody,
    headers: request.headers,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Webhook rejected." },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

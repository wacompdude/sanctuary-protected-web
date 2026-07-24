import { NextResponse } from "next/server";
import { processBillingWebhook } from "@/lib/billing/webhooks";

/**
 * Billing provider webhook receiver.
 * URL shape: /api/billing/webhooks/<provider>
 *
 * No provider adapter is installed yet. Events are rejected unless a provider
 * verifies them; when an adapter is added, persistence is idempotent via
 * billing_events.provider_event_id.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const rawBody = await request.text();

  const result = await processBillingWebhook({
    providerSlug: provider,
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
    {
      ok: true,
      duplicate: Boolean(result.duplicate),
      eventId: result.eventId ?? null,
      type: result.normalizedType ?? null,
    },
    { status: 200 },
  );
}

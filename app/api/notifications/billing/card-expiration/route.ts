import { NextResponse } from "next/server";
import { scanSubscriptionCardExpirations } from "@/lib/billing/stripe/subscription-card-expiration-live";

function authorizeRequest(request: Request): boolean {
  const secrets = [
    process.env.NOTIFICATION_DISPATCH_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    return process.env.NODE_ENV === "development";
  }

  const header =
    request.headers.get("authorization") ??
    request.headers.get("x-notification-dispatch-secret");
  if (!header) return false;

  const token = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : header.trim();
  return secrets.includes(token);
}

/**
 * Daily read of effective subscription cards. Queues in-app and email notices.
 * The existing notification dispatch cron sends the email.
 */
export async function GET(request: Request) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await scanSubscriptionCardExpirations();
  return NextResponse.json(result, { status: result.errors.length > 0 ? 207 : 200 });
}

export async function POST(request: Request) {
  return GET(request);
}

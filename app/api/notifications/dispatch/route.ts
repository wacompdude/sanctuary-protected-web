import { NextResponse } from "next/server";
import { dispatchPendingDeliveries } from "@/lib/notifications/dispatch-notification";

function authorizeDispatch(request: Request): boolean {
  const secrets = [
    process.env.NOTIFICATION_DISPATCH_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    // Allow local/dev without secret only when explicitly using console provider.
    return (
      process.env.NODE_ENV === "development" &&
      (process.env.EMAIL_PROVIDER ?? "").toLowerCase() === "console"
    );
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
 * Secure dispatcher for pending email deliveries.
 * Call from Vercel Cron or a trusted worker with NOTIFICATION_DISPATCH_SECRET.
 */
export async function POST(request: Request) {
  if (!authorizeDispatch(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let limit = 50;
  let notificationId: string | undefined;
  try {
    const body = (await request.json().catch(() => null)) as {
      limit?: number;
      notificationId?: string;
    } | null;
    if (body?.limit) limit = Number(body.limit);
    if (body?.notificationId) notificationId = String(body.notificationId);
  } catch {
    // empty body is fine
  }

  const result = await dispatchPendingDeliveries({ limit, notificationId });
  const status = result.error ? 503 : 200;
  return NextResponse.json(result, { status });
}

export async function GET(request: Request) {
  // Vercel Cron uses GET by default for cron jobs.
  return POST(request);
}

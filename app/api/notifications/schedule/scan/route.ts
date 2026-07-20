import { NextResponse } from "next/server";
import { scanScheduleReminders } from "@/lib/schedule/scan-reminders";

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
 * Hourly cron that queues assignment reminders and unfilled-shift warnings.
 * Existing /api/notifications/dispatch sends the email deliveries.
 */
export async function GET(request: Request) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await scanScheduleReminders();
  const hasErrors = result.errors.length > 0;
  return NextResponse.json(result, { status: hasErrors ? 207 : 200 });
}

export async function POST(request: Request) {
  return GET(request);
}

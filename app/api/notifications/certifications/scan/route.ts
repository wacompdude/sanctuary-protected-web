import { NextResponse } from "next/server";
import { scanCertificationExpirations } from "@/lib/notifications/scan-certification-expirations";

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
 * Daily cron that scans certifications expiring within each church's warning window
 * and enqueues notification_deliveries. The existing dispatch cron then sends them.
 */
export async function GET(request: Request) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await scanCertificationExpirations();
  const hasErrors = result.errors.length > 0;
  return NextResponse.json(result, { status: hasErrors ? 207 : 200 });
}

export async function POST(request: Request) {
  return GET(request);
}

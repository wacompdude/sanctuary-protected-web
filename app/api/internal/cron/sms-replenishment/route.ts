import { NextResponse } from "next/server";
import { reconcileAutomaticSmsReplenishment } from "@/lib/billing/stripe/sms-replenishment-reconciliation-live";

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
 * Vercel Cron safety net for automatic SMS replenishment.
 * Invokes claim-gated orchestration only. Accepts no organization or financial parameters.
 */
export async function GET(request: Request) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileAutomaticSmsReplenishment();
  const status =
    result.status === "error" ? 503 : result.status === "partial" ? 207 : 200;
  return NextResponse.json(
    {
      status: result.status,
      candidateCount: result.candidateCount,
      processedCount: result.processedCount,
      batchSize: result.batchSize,
      outcomes: result.outcomes,
      durationMs: result.durationMs,
    },
    { status },
  );
}

export async function POST(request: Request) {
  return GET(request);
}

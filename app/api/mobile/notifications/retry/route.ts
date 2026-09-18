import { NextResponse } from "next/server";
import {
  mobileNotificationCorsHeaders,
  retryMobileNotificationDelivery,
} from "@/lib/notifications/mobile-api";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: mobileNotificationCorsHeaders(),
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: mobileNotificationCorsHeaders(),
  });
}

export async function POST(request: Request) {
  let input: { organizationId?: string | null; deliveryId?: string | null } =
    {};
  try {
    input = (await request.json()) as typeof input;
  } catch {
    input = {};
  }

  try {
    const result = await retryMobileNotificationDelivery(request, input);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile notification retry failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error ? error.message : "Unable to retry delivery.",
      },
      500,
    );
  }
}

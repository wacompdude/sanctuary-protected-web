import { NextResponse } from "next/server";
import {
  loadMobileNotificationComposer,
  mobileNotificationCorsHeaders,
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

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get(
    "organizationId",
  );

  try {
    const result = await loadMobileNotificationComposer(
      request,
      organizationId,
    );
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile notification compose failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the alert composer.",
      },
      500,
    );
  }
}

import { NextResponse } from "next/server";
import {
  mobileNotificationCorsHeaders,
  sendMobileNotification,
  type MobileSendNotificationInput,
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
  let input: MobileSendNotificationInput = {};
  try {
    input = (await request.json()) as MobileSendNotificationInput;
  } catch {
    input = {};
  }

  try {
    const result = await sendMobileNotification(request, input);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile notification send failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to send notification.",
      },
      500,
    );
  }
}

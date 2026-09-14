import { NextResponse } from "next/server";
import {
  mobileNotificationCorsHeaders,
  registerMobilePushToken,
  type MobilePushRegisterInput,
} from "@/lib/notifications/mobile-push";

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
  let input: MobilePushRegisterInput = {};
  try {
    input = (await request.json()) as MobilePushRegisterInput;
  } catch {
    input = {};
  }

  try {
    const result = await registerMobilePushToken(request, input);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile push register failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to register this device for alerts.",
      },
      500,
    );
  }
}

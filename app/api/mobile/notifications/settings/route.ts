import { NextResponse } from "next/server";
import {
  mobileNotificationCorsHeaders,
  updateMobileNotificationSettings,
  type MobileNotificationSettingsInput,
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
  let input: MobileNotificationSettingsInput = {};
  try {
    input = (await request.json()) as MobileNotificationSettingsInput;
  } catch {
    input = {};
  }

  try {
    const result = await updateMobileNotificationSettings(request, input);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile notification settings failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to save notification settings.",
      },
      500,
    );
  }
}

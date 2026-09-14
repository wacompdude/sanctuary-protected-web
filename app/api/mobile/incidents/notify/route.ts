import { NextResponse } from "next/server";
import {
  mobileNotificationCorsHeaders,
  notifyMobileIncident,
  type MobileIncidentNotifyInput,
} from "@/lib/incidents/mobile-notify";

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
  let input: MobileIncidentNotifyInput = {};
  try {
    input = (await request.json()) as MobileIncidentNotifyInput;
  } catch {
    input = {};
  }

  try {
    const result = await notifyMobileIncident(request, input);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile incident notify failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to send incident notification.",
      },
      500,
    );
  }
}

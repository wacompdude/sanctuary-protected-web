import { NextResponse } from "next/server";
import {
  getMobileAuthContext,
  mobileMfaCorsHeaders,
  parseMfaChannel,
  startMobileLoginChallenge,
} from "@/lib/mfa/mobile-api";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: mobileMfaCorsHeaders(),
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: mobileMfaCorsHeaders(),
  });
}

export async function POST(request: Request) {
  const ctx = await getMobileAuthContext(request);
  if (!ctx) {
    return json(
      { status: "unauthenticated", error: "Sign in with your email and password first." },
      401,
    );
  }

  let channel = parseMfaChannel("email");
  let organizationId: string | null = null;
  try {
    const body = (await request.json()) as {
      channel?: string;
      organizationId?: string | null;
    };
    channel = parseMfaChannel(body.channel);
    organizationId = body.organizationId?.trim() || null;
  } catch {
    channel = parseMfaChannel("email");
  }

  try {
    const result = await startMobileLoginChallenge({
      ctx,
      channel,
      organizationId,
    });
    return json(result);
  } catch (error) {
    console.error("mobile MFA challenge failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to send the verification code.",
      },
      500,
    );
  }
}

import { NextResponse } from "next/server";
import {
  getMobileAuthContext,
  mobileMfaCorsHeaders,
  parseMfaChannel,
  verifyMobileLoginMfa,
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
  let code = "";
  try {
    const body = (await request.json()) as {
      channel?: string;
      code?: string;
    };
    channel = parseMfaChannel(body.channel);
    code = String(body.code ?? "");
  } catch {
    return json(
      { status: "error", error: "Enter the 6-digit verification code." },
      400,
    );
  }

  try {
    const result = await verifyMobileLoginMfa({
      ctx,
      channel,
      code,
    });
    return json(result);
  } catch (error) {
    console.error("mobile MFA verify failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error ? error.message : "Unable to verify that code.",
      },
      500,
    );
  }
}

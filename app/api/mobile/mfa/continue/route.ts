import { NextResponse } from "next/server";
import {
  continueMobileLoginMfa,
  getMobileAuthContext,
  mobileMfaCorsHeaders,
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

  let organizationId: string | null = null;
  let mfaToken: string | null = null;
  let trustedDeviceToken: string | null = null;
  try {
    const body = (await request.json()) as {
      organizationId?: string | null;
      mfaToken?: string | null;
      trustedDeviceToken?: string | null;
    };
    organizationId = body.organizationId?.trim() || null;
    mfaToken = body.mfaToken?.trim() || null;
    trustedDeviceToken = body.trustedDeviceToken?.trim() || null;
  } catch {
    organizationId = null;
    mfaToken = null;
    trustedDeviceToken = null;
  }

  try {
    const result = await continueMobileLoginMfa({
      ctx,
      organizationId,
      mfaToken,
      trustedDeviceToken,
    });
    return json(result);
  } catch (error) {
    console.error("mobile MFA continue failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to continue sign-in verification.",
      },
      500,
    );
  }
}

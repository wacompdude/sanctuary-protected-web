import { NextResponse } from "next/server";
import {
  createMobileInvitation,
  listMobilePendingInvitations,
  mobileTeamCorsHeaders,
  resendMobileInvitation,
  revokeMobileInvitation,
} from "@/lib/organization/mobile-team-api";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: mobileTeamCorsHeaders(),
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: mobileTeamCorsHeaders(),
  });
}

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get(
    "organizationId",
  );
  try {
    const result = await listMobilePendingInvitations(request, organizationId);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile team invitations GET failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to load invitations.",
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      organizationId?: string;
      email?: string;
      role?: string;
      expiresInDays?: number;
      invitationId?: string;
    };
    const action = String(body.action ?? "create").trim();

    if (action === "create") {
      const result = await createMobileInvitation(request, body);
      return json(result.body, result.status);
    }
    if (action === "resend") {
      const result = await resendMobileInvitation(request, body);
      return json(result.body, result.status);
    }
    if (action === "revoke") {
      const result = await revokeMobileInvitation(request, body);
      return json(result.body, result.status);
    }

    return json(
      { status: "error", error: `Unknown action: ${action}` },
      400,
    );
  } catch (error) {
    console.error("mobile team invitations POST failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to update invitation.",
      },
      500,
    );
  }
}

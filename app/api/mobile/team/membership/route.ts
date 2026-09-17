import { NextResponse } from "next/server";
import {
  mobileTeamCorsHeaders,
  updateMobileMemberProfile,
  updateMobileMembershipRole,
  updateMobileMembershipStatus,
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      organizationId?: string;
      membershipId?: string;
      userId?: string;
      role?: string;
      status?: string;
      confirmed?: boolean;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    const action = String(body.action ?? "").trim();

    if (action === "role") {
      const result = await updateMobileMembershipRole(request, body);
      return json(result.body, result.status);
    }
    if (action === "status") {
      const result = await updateMobileMembershipStatus(request, body);
      return json(result.body, result.status);
    }
    if (action === "profile") {
      const result = await updateMobileMemberProfile(request, body);
      return json(result.body, result.status);
    }

    return json(
      { status: "error", error: `Unknown action: ${action}` },
      400,
    );
  } catch (error) {
    console.error("mobile team membership failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to update membership.",
      },
      500,
    );
  }
}

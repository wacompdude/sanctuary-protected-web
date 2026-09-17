import { NextResponse } from "next/server";
import {
  mobileTeamCorsHeaders,
  provisionMobileMember,
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
      organizationId?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      role?: string;
      passwordMode?: string;
      password?: string;
      resetExistingPassword?: boolean;
    };
    const result = await provisionMobileMember(request, body);
    return json(result.body, result.status);
  } catch (error) {
    console.error("mobile team provision failed:", error);
    return json(
      {
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to provision member.",
      },
      500,
    );
  }
}

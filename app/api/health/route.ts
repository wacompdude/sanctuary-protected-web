import { NextResponse } from "next/server";

/**
 * Lightweight deploy fingerprint so we can confirm which Git commit
 * production is actually serving.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    notificationsRoute: "/notifications",
  });
}

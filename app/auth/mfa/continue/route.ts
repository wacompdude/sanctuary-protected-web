import { redirect } from "next/navigation";
import {
  getLoginMfaContext,
  safeMfaNextPath,
  tryCompleteLoginWithTrustedDevice,
} from "@/lib/mfa/login";
import {
  isPlatformDestination,
  mfaCookieFromPolicy,
} from "@/lib/mfa/effective-policy";
import { inspectLoginMfaSatisfaction } from "@/lib/mfa/gate";
import { getEffectiveMfaPolicy } from "@/lib/mfa/resolve-policy";
import { readMfaCookieValue, writeMfaSessionCookie } from "@/lib/mfa/session";
import { readTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-session";

/**
 * Route Handler so cookies().set is allowed.
 * Password login lands here first:
 *   resolve organization context
 *   evaluate MFA policy
 *   reject stale cookies after Require MFA Immediately
 *   skip challenge when policy does not require MFA
 *   otherwise trusted device (unless forced reauth), then /auth/mfa
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = safeMfaNextPath(url.searchParams.get("next"));
  const platformDestination = isPlatformDestination(nextPath);

  const ctx = await getLoginMfaContext();
  if (!ctx) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const policy = await getEffectiveMfaPolicy({
    userId: ctx.userId,
    pathname: nextPath,
  });

  if (policy.needsOrganizationSelection) {
    redirect(
      `/auth/select-organization?next=${encodeURIComponent(nextPath)}`,
    );
  }

  const existingCookie = await readMfaCookieValue();
  const { inspected } = await inspectLoginMfaSatisfaction({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    cookieValue: existingCookie,
    organizationId: policy.organizationId,
    platformDestination,
  });

  if (inspected.authentic && inspected.satisfiesReauth) {
    redirect(nextPath);
  }

  if (!policy.required) {
    const wrote = await writeMfaSessionCookie({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      ...mfaCookieFromPolicy(policy),
    });
    if (wrote) {
      redirect(nextPath);
    }
  }

  const cookieValue = await readTrustedDeviceCookieValue();
  const skipped = await tryCompleteLoginWithTrustedDevice({
    cookieValue,
    pathname: nextPath,
    organizationId: policy.organizationId,
    forceFreshMfa: inspected.staleDueToReauth,
  });
  if (skipped) {
    redirect(nextPath);
  }

  redirect(`/auth/mfa?next=${encodeURIComponent(nextPath)}`);
}

export function POST(request: Request) {
  return GET(request);
}

import {
  getLoginMfaContext,
  resolveTrustedDeviceMfaCookie,
  safeMfaNextPath,
} from "@/lib/mfa/login";
import {
  isPlatformDestination,
  mfaCookieFromPolicy,
} from "@/lib/mfa/effective-policy";
import { inspectLoginMfaSatisfaction } from "@/lib/mfa/gate";
import { getEffectiveMfaPolicy } from "@/lib/mfa/resolve-policy";
import {
  readMfaCookieValue,
  redirectToSameOriginPath,
  redirectWithMfaSessionCookie,
} from "@/lib/mfa/session";
import { readTrustedDeviceCookieValue } from "@/lib/mfa/trusted-device-session";

/**
 * Route Handler so Set-Cookie can be attached to the redirect response.
 * Password login lands here first:
 *   resolve organization context
 *   evaluate MFA policy
 *   reject stale cookies after Require MFA Immediately
 *   skip challenge when policy does not require MFA
 *   otherwise trusted device (unless forced reauth), then /auth/mfa
 *
 * Policy-skip and trusted-device success must set `sp_mfa` on the
 * NextResponse redirect. cookies().set() + redirect() drops the cookie
 * and loops /auth/mfa/continue ↔ /home.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextPath = safeMfaNextPath(url.searchParams.get("next"));
  const platformDestination = isPlatformDestination(nextPath);

  const ctx = await getLoginMfaContext();
  if (!ctx) {
    return redirectToSameOriginPath(
      request,
      `/login?next=${encodeURIComponent(nextPath)}`,
    );
  }

  const policy = await getEffectiveMfaPolicy({
    userId: ctx.userId,
    pathname: nextPath,
  });

  if (policy.needsOrganizationSelection) {
    return redirectToSameOriginPath(
      request,
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
    return redirectToSameOriginPath(request, nextPath);
  }

  if (!policy.required) {
    const skipped = await redirectWithMfaSessionCookie(request, nextPath, {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      ...mfaCookieFromPolicy(policy),
    });
    if (skipped) {
      return skipped;
    }
  }

  const cookieValue = await readTrustedDeviceCookieValue();
  const trustedCookie = await resolveTrustedDeviceMfaCookie({
    cookieValue,
    pathname: nextPath,
    organizationId: policy.organizationId,
    forceFreshMfa: inspected.staleDueToReauth,
  });
  if (trustedCookie) {
    const trusted = await redirectWithMfaSessionCookie(
      request,
      nextPath,
      trustedCookie,
    );
    if (trusted) {
      return trusted;
    }
  }

  return redirectToSameOriginPath(
    request,
    `/auth/mfa?next=${encodeURIComponent(nextPath)}`,
  );
}

export function POST(request: Request) {
  return GET(request);
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAuthEntryPath,
  isMfaChallengePath,
  isProtectedPath,
  isPublicPath,
  isWebhookPath,
} from "@/lib/auth/routes";
import { hasSatisfiedLoginMfa } from "@/lib/mfa/gate";
import { MFA_COOKIE_NAME } from "@/lib/mfa/policy";
import { getAuthSessionBinding } from "@/lib/mfa/session-cookie";
import { getSupabaseAnonKey, getSupabaseUrl, hasEnvVars } from "./env";

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  sessionResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const { pathname } = request.nextUrl;

  // Provider webhooks must reach the route handler as POST. Never redirect them
  // to /login (307 preserves POST → page routes answer with 405).
  if (isWebhookPath(pathname)) {
    return supabaseResponse;
  }

  if (!hasEnvVars) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    // Refresh the session cookie before reading the user.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const {
      data: { session },
    } = user ? await supabase.auth.getSession() : { data: { session: null } };

    const mfaOk = user
      ? await hasSatisfiedLoginMfa({
          userId: user.id,
          sessionId: getAuthSessionBinding(session?.access_token, user.id),
          cookieValue: request.cookies.get(MFA_COOKIE_NAME)?.value,
        })
      : false;

    if (user && isAuthEntryPath(pathname)) {
      // Allow account switching without bouncing back into the app.
      const switchAccount =
        request.nextUrl.searchParams.get("switch") === "1" ||
        request.nextUrl.searchParams.get("switch") === "true";
      if (!switchAccount) {
        const url = request.nextUrl.clone();
        if (!mfaOk) {
          url.pathname = "/auth/mfa";
          const next = request.nextUrl.searchParams.get("next");
          url.search = "";
          url.searchParams.set(
            "next",
            next && next.startsWith("/") && !next.startsWith("//")
              ? next
              : "/home",
          );
          return redirectWithSession(url, supabaseResponse);
        }
        url.pathname = "/home";
        url.search = "";
        return redirectWithSession(url, supabaseResponse);
      }
    }

    if (
      user &&
      isProtectedPath(pathname) &&
      !mfaOk &&
      !isMfaChallengePath(pathname)
    ) {
      if (!isSafeMethod(request.method)) {
        return NextResponse.json({ error: "MFA required" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/auth/mfa";
      const next = `${pathname}${request.nextUrl.search}`;
      url.search = "";
      url.searchParams.set("next", next);
      return redirectWithSession(url, supabaseResponse);
    }

    if (!user && isProtectedPath(pathname)) {
      // Avoid 307 POST → /login → 405 on the login page.
      if (!isSafeMethod(request.method)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const next = `${pathname}${request.nextUrl.search}`;
      url.searchParams.set("next", next);
      return redirectWithSession(url, supabaseResponse);
    }

    if (!user && !isPublicPath(pathname) && !isProtectedPath(pathname)) {
      if (!isSafeMethod(request.method)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return redirectWithSession(url, supabaseResponse);
    }
  } catch (error) {
    console.error("Supabase proxy session update failed:", error);
    // Fail open for public pages so a misconfigured env does not 500 the site.
    if (isProtectedPath(pathname)) {
      if (!isSafeMethod(request.method)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAuthEntryPath,
  isProtectedPath,
  isPublicPath,
  isWebhookPath,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl, hasEnvVars } from "./env";

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
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

    if (user && isAuthEntryPath(pathname)) {
      // Allow account switching without bouncing back into the app.
      const switchAccount =
        request.nextUrl.searchParams.get("switch") === "1" ||
        request.nextUrl.searchParams.get("switch") === "true";
      if (!switchAccount) {
        const url = request.nextUrl.clone();
        url.pathname = "/home";
        url.search = "";
        return NextResponse.redirect(url);
      }
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
      return NextResponse.redirect(url);
    }

    if (!user && !isPublicPath(pathname) && !isProtectedPath(pathname)) {
      if (!isSafeMethod(request.method)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
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

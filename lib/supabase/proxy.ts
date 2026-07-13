import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAuthEntryPath,
  isProtectedPath,
  isPublicPath,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl, hasEnvVars } from "./env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
            request,
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
    const { pathname } = request.nextUrl;

    if (user && isAuthEntryPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    if (!user && isProtectedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const next = `${pathname}${request.nextUrl.search}`;
      url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }

    if (!user && !isPublicPath(pathname) && !isProtectedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  } catch (error) {
    console.error("Supabase proxy session update failed:", error);
    // Fail open for public pages so a misconfigured env does not 500 the site.
    const { pathname } = request.nextUrl;
    if (isProtectedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

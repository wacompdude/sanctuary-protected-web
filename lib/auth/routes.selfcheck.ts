/**
 * Stage 3B — MFA route coverage self-check (no network).
 * Run: npx --yes tsx lib/auth/routes.selfcheck.ts
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  isProtectedPath,
  isPublicPath,
  PROTECTED_PATH_PREFIXES,
  PUBLIC_PATHS,
} from "@/lib/auth/routes";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function hasPageRoute(dir: string): boolean {
  try {
    for (const name of readdirSync(dir)) {
      if (name === "page.tsx" || name === "page.ts" || name === "page.jsx") {
        return true;
      }
      const full = join(dir, name);
      if (statSync(full).isDirectory() && hasPageRoute(full)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Top-level (app) segments that expose user-facing pages (ignore action-only dirs). */
function appRouteSegments(appDir: string): string[] {
  const base = join(appDir, "(app)");
  const entries = readdirSync(base);
  const segments: string[] = [];
  for (const name of entries) {
    if (name.startsWith("(") || name.startsWith("_")) continue;
    const full = join(base, name);
    if (!statSync(full).isDirectory()) continue;
    if (!hasPageRoute(full)) continue;
    segments.push(`/${name}`);
  }
  return segments.sort();
}

function main() {
  assert(
    PROTECTED_PATH_PREFIXES.includes("/safety-concerns"),
    "1 /safety-concerns listed",
  );
  assert(isProtectedPath("/safety-concerns"), "2 /safety-concerns protected");
  assert(
    isProtectedPath("/safety-concerns/uuid/history"),
    "3 nested safety-concerns protected",
  );
  assert(!isPublicPath("/safety-concerns"), "4 safety-concerns not public");

  assert(isPublicPath("/login"), "5 login public");
  assert(isPublicPath("/auth/forgot-password"), "6 forgot public");
  assert(isPublicPath("/auth/confirm"), "7 confirm public");
  assert(isPublicPath("/auth/update-password"), "8 update-password public");
  assert(isPublicPath("/auth/mfa"), "9 mfa challenge public via /auth prefix");

  // Sensitive app areas under (app) must be covered by a protected prefix.
  const required = [
    "/incidents",
    "/training",
    "/policies",
    "/security-hardware",
    "/medical-supplies",
    "/schedule",
    "/settings",
    "/notifications",
    "/team",
    "/campuses",
    "/safety-concerns",
    "/profile",
    "/dashboard",
    "/home",
  ];
  for (const path of required) {
    assert(isProtectedPath(path), `10 protected ${path}`);
  }

  const segments = appRouteSegments(join(process.cwd(), "app"));
  const uncovered = segments.filter((seg) => !isProtectedPath(seg));
  assert(
    uncovered.length === 0,
    `11 all (app) top-level segments protected; uncovered=${uncovered.join(",")}`,
  );

  assert(PUBLIC_PATHS.includes("/auth/forgot-password"), "12 forgot in PUBLIC_PATHS");

  console.log("auth routes MFA coverage self-check passed");
}

main();

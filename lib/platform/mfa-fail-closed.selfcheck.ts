/**
 * Stage 3H-1 — Platform MFA fail-closed static self-check.
 * Run: npx --yes tsx lib/platform/mfa-fail-closed.selfcheck.ts
 */
import fs from "node:fs";
import path from "node:path";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const root = process.cwd();
const authSrc = fs.readFileSync(path.join(root, "lib/platform/auth.ts"), "utf8");

assert(authSrc.includes("isPlatformMfaSatisfied"), "1 helper present");
assert(
  authSrc.includes("getAuthenticatorAssuranceLevel"),
  "2 uses Supabase AAL API",
);
assert(authSrc.includes('currentLevel === "aal2"'), "3 requires aal2");

const fnStart = authSrc.indexOf("export async function isPlatformMfaSatisfied");
const fnEnd = authSrc.indexOf("export async function requirePlatformMfa");
assert(fnStart >= 0 && fnEnd > fnStart, "4 function bounds");
const body = authSrc.slice(fnStart, fnEnd);

assert(
  !body.includes("return Boolean(ctx.account.mfa_verified_at)"),
  "5 no mfa_verified_at bypass on AAL failure",
);
assert(body.includes("if (error || !data)"), "6 handles error/null data");
assert(
  /if \(error \|\| !data\) \{\s*return false;/.test(body),
  "7 error/null returns false",
);
assert(/catch \{\s*return false;/.test(body), "8 catch returns false");
assert(
  body.includes("if (!ctx.account.mfa_required) return true"),
  "9 mfa_required false still allows",
);

console.log("platform mfa fail-closed self-check passed");

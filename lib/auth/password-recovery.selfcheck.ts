/**
 * Stage 3B — password recovery security self-check (no network / no Production).
 * Run: npx --yes tsx lib/auth/password-recovery.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PASSWORD_RECOVERY_NEXT_PATH,
  isSafeRelativeNextPath,
  resolveConfirmNextPath,
  safeAuthNextPath,
} from "@/lib/auth/safe-next";
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from "@/lib/auth/validation";
import { isAuthEntryPath, isProtectedPath, isPublicPath } from "@/lib/auth/routes";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function main() {
  assert(validateEmail("") === "Email is required.", "1 empty email");
  assert(validateEmail("not-an-email") !== null, "2 invalid email");
  assert(validateEmail("user@example.com") === null, "3 valid email");

  assert(validatePassword("short") !== null, "4 short password");
  assert(validatePassword("longenough") === null, "5 valid password");
  assert(
    validatePasswordConfirmation("abcdefghi", "abcdefghz") !== null,
    "6 mismatch",
  );
  assert(
    validatePasswordConfirmation("abcdefghi", "abcdefghi") === null,
    "7 match",
  );

  assert(!isSafeRelativeNextPath("https://evil.example/"), "8 reject absolute");
  assert(!isSafeRelativeNextPath("//evil.example"), "9 reject protocol-relative");
  assert(!isSafeRelativeNextPath("\\evil"), "10 reject backslash");
  assert(isSafeRelativeNextPath("/auth/update-password"), "11 allow relative");
  assert(safeAuthNextPath("//evil", "/home") === "/home", "12 fallback");

  assert(
    resolveConfirmNextPath({ type: "recovery", next: "/home" }) ===
      PASSWORD_RECOVERY_NEXT_PATH,
    "13 recovery forces update-password",
  );
  assert(
    resolveConfirmNextPath({ type: "recovery", next: "https://evil.test" }) ===
      PASSWORD_RECOVERY_NEXT_PATH,
    "14 recovery ignores evil next",
  );
  assert(
    resolveConfirmNextPath({ type: "signup", next: "/home" }) === "/home",
    "15 signup next preserved when safe",
  );
  assert(
    resolveConfirmNextPath({ type: "signup", next: "//evil" }) === "/home",
    "16 signup evil next rejected",
  );

  const forgot = read("components/forgot-password-form.tsx");
  assert(!forgot.includes("Placeholder"), "17 forgot form not placeholder");
  assert(
    forgot.includes("If an account exists for that email address"),
    "18 generic confirmation copy",
  );

  const forgotAction = read("app/auth/forgot-password/actions.ts");
  assert(
    forgotAction.includes("resetPasswordForEmail"),
    "19 uses resetPasswordForEmail",
  );
  assert(
    forgotAction.includes("buildPasswordRecoveryRedirectUrl") ||
      forgotAction.includes("buildAuthConfirmUrl"),
    "20 uses constructed redirect",
  );
  assert(
    !forgotAction.includes("return { error: error.message"),
    "21 does not return provider error to client",
  );

  const confirm = read("app/auth/confirm/route.ts");
  assert(confirm.includes("resolveConfirmNextPath"), "22 confirm sanitizes next");
  assert(confirm.includes("verifyOtp"), "23 confirm verifies token_hash");
  assert(
    confirm.includes("invalid_or_expired_link"),
    "24 confirm uses generic error",
  );
  assert(!/redirect\(next\)/.test(confirm), "25 confirm does not redirect raw next");

  const updateAction = read("app/auth/update-password/actions.ts");
  assert(updateAction.includes("updateUser"), "26 updateUser used");
  assert(updateAction.includes("signOut"), "27 signs out after reset");
  assert(
    updateAction.includes("validatePasswordConfirmation"),
    "28 confirm password validated",
  );
  assert(
    updateAction.includes("revokeAllTrustedDevices"),
    "29 revokes trusted devices",
  );
  assert(
    !updateAction.toLowerCase().includes("console.log(password"),
    "30 does not log password",
  );

  const updateForm = read("components/update-password-form.tsx");
  assert(updateForm.includes("confirmPassword"), "31 confirm field present");
  assert(updateForm.includes("/login?reset=1"), "32 returns to login");

  assert(isPublicPath("/auth/forgot-password"), "33 forgot remains public");
  assert(isPublicPath("/auth/update-password"), "34 update remains public");
  assert(isPublicPath("/auth/confirm"), "35 confirm remains public");
  assert(isAuthEntryPath("/auth/forgot-password"), "36 forgot is auth entry");
  assert(
    isProtectedPath("/safety-concerns"),
    "37 safety-concerns protected (cross-check)",
  );
  assert(
    isProtectedPath("/safety-concerns/abc/edit"),
    "38 nested safety-concerns protected",
  );

  console.log("password recovery self-check passed");
}

main();

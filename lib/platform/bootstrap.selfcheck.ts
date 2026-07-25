import {
  APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS,
  PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH,
  assertBootstrapCliOnly,
  isApprovedBootstrapEmail,
  isBootstrapExplicitlyEnabled,
  validateBootstrapEnv,
} from "@/lib/platform/bootstrap";

/**
 * Phase 4 bootstrap self-check (no database / no password IO).
 * Run: npx --yes tsx lib/platform/bootstrap.selfcheck.ts
 */
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(
  APPROVED_SUPER_ADMIN_BOOTSTRAP_EMAILS.includes(
    "repus_admin@sanctuaryprotected.com",
  ),
  "approved bootstrap email present",
);
assert(
  isApprovedBootstrapEmail("repus_admin@sanctuaryprotected.com"),
  "exact approved email accepted",
);
assert(
  isApprovedBootstrapEmail("Repus_Admin@SanctuaryProtected.com"),
  "approved email is case-insensitive",
);
assert(
  !isApprovedBootstrapEmail("owner@example.com"),
  "arbitrary email rejected",
);
assert(
  !isApprovedBootstrapEmail("admin@sanctuaryprotected.com"),
  "company domain alone is not enough",
);

assert(!isBootstrapExplicitlyEnabled(undefined), "disabled by default");
assert(!isBootstrapExplicitlyEnabled("false"), "false is disabled");
assert(!isBootstrapExplicitlyEnabled("1"), "1 is not true");
assert(isBootstrapExplicitlyEnabled("true"), "true enables");
assert(isBootstrapExplicitlyEnabled("TRUE"), "TRUE enables");

const disabled = validateBootstrapEnv({
  enabled: "false",
  email: "repus_admin@sanctuaryprotected.com",
  password: "ValidPass123!",
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
});
assert(!disabled.ok, "disabled bootstrap fails validation");

const missingPassword = validateBootstrapEnv({
  enabled: "true",
  email: "repus_admin@sanctuaryprotected.com",
  password: "",
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
});
assert(!missingPassword.ok, "missing password fails");
if (!missingPassword.ok) {
  assert(
    !missingPassword.error.toLowerCase().includes("validpass"),
    "error must not echo password material",
  );
}

const shortPassword = validateBootstrapEnv({
  enabled: "true",
  email: "repus_admin@sanctuaryprotected.com",
  password: "Ab1",
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
});
assert(!shortPassword.ok, "short password fails");
assert(
  PLATFORM_BOOTSTRAP_MIN_PASSWORD_LENGTH >= 12,
  "bootstrap password policy is at least 12 chars",
);

const unapproved = validateBootstrapEnv({
  enabled: "true",
  email: "someone@sanctuaryprotected.com",
  password: "ValidPass1234",
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
});
assert(!unapproved.ok, "unapproved email fails");

const ok = validateBootstrapEnv({
  enabled: "true",
  email: "repus_admin@sanctuaryprotected.com",
  password: "ValidPass1234",
  supabaseUrl: "https://example.supabase.co",
  serviceRoleKey: "service-role",
});
assert(ok.ok, "valid bootstrap env passes");
if (ok.ok) {
  assert(
    ok.email === "repus_admin@sanctuaryprotected.com",
    "email normalized",
  );
  assert(ok.password === "ValidPass1234", "password preserved for createUser only");
}

const previous = process.env.SUPER_ADMIN_BOOTSTRAP_CLI;
delete process.env.SUPER_ADMIN_BOOTSTRAP_CLI;
let blocked = false;
try {
  assertBootstrapCliOnly();
} catch {
  blocked = true;
}
assert(blocked, "bootstrap blocked without CLI flag");
process.env.SUPER_ADMIN_BOOTSTRAP_CLI = "1";
assertBootstrapCliOnly();
if (previous === undefined) {
  delete process.env.SUPER_ADMIN_BOOTSTRAP_CLI;
} else {
  process.env.SUPER_ADMIN_BOOTSTRAP_CLI = previous;
}

console.log("platform bootstrap selfcheck: ok");

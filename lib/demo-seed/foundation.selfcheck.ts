/**
 * Demo seed foundation self-check (no database required).
 * Run: npx --yes tsx lib/demo-seed/foundation.selfcheck.ts
 */
import {
  DEMO_CHURCH_EMAIL,
  DEMO_CHURCH_NAME,
  DEMO_CHURCH_SLUG,
  DEMO_CHURCH_TIMEZONE,
  DEMO_EXTRA_MEMBERS,
  DEMO_NAMED_USERS,
  DEMO_NOTIFICATION_TYPES_FOR_EMAIL,
  DEMO_OWNER_PLATFORM_EMAIL,
  DEMO_PRIMARY_CAMPUS,
  DEMO_ROLE_MAP,
  DEMO_SEED_SOURCE,
  DEMO_SUNSHINE_CAMPUS,
  DEMO_THREAT_WEEK_LEVELS,
  DEMO_WEEK_STARTS_ON,
} from "@/lib/demo-seed/constants";
import {
  isDemoSeedEnvironmentAllowed,
  validateDemoSeedCleanupEnv,
  validateDemoSeedEnv,
} from "@/lib/demo-seed/env";
import { DEMO_CLEANUP_TABLE_ORDER } from "@/lib/demo-seed/registry";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(DEMO_SEED_SOURCE === "first-church-demo", "stable seed source");
assert(
  DEMO_CHURCH_NAME === "First Church of the First Church",
  "church name",
);
assert(DEMO_CHURCH_SLUG.includes("first-church"), "church slug");
assert(DEMO_CHURCH_EMAIL === "church@fcotfc.org", "church email normalized");
assert(DEMO_CHURCH_TIMEZONE === "America/Los_Angeles", "org timezone");
assert(DEMO_WEEK_STARTS_ON === 0, "week starts Sunday");
assert(
  DEMO_OWNER_PLATFORM_EMAIL === "repus_admin@sanctuaryprotected.com",
  "platform owner email",
);
assert(DEMO_PRIMARY_CAMPUS.is_primary === true, "primary campus");
assert(DEMO_SUNSHINE_CAMPUS.is_primary === false, "sunshine secondary");
assert(
  DEMO_SUNSHINE_CAMPUS.timezone === "America/New_York",
  "sunshine campus tz",
);
assert(DEMO_THREAT_WEEK_LEVELS.length === 10, "ten threat weeks");
assert(DEMO_NAMED_USERS.length === 6, "six named church users");
assert(DEMO_EXTRA_MEMBERS.length >= 8, "at least eight extra members");
assert(
  DEMO_EXTRA_MEMBERS.every((m) => m.email.endsWith(".test")),
  "extra members use .test domain",
);
assert(
  DEMO_NAMED_USERS.filter((u) => u.enableEmailNotifications).length === 2,
  "two email-enabled notification users",
);
assert(DEMO_NOTIFICATION_TYPES_FOR_EMAIL.length >= 8, "notification types");
assert(DEMO_ROLE_MAP.Owner === "owner", "owner role map");
assert(DEMO_ROLE_MAP["Co-owner"] === "co_owner", "co-owner role map");
assert(
  DEMO_ROLE_MAP.Administrator === "administrator",
  "administrator role map",
);
assert(PLAN_KEYS.OMNI_ENTERPRISE === "omni_enterprise", "omni plan key");

assert(
  DEMO_CLEANUP_TABLE_ORDER.includes("churches"),
  "cleanup includes churches",
);
assert(
  DEMO_CLEANUP_TABLE_ORDER.indexOf("shift_assignments") <
    DEMO_CLEANUP_TABLE_ORDER.indexOf("schedule_shifts"),
  "cleanup deletes assignments before shifts",
);
assert(
  DEMO_CLEANUP_TABLE_ORDER.indexOf("church_memberships") <
    DEMO_CLEANUP_TABLE_ORDER.indexOf("churches"),
  "cleanup deletes memberships before church",
);

assert(
  isDemoSeedEnvironmentAllowed({
    NODE_ENV: "development",
    VERCEL_ENV: "",
  } as NodeJS.ProcessEnv),
  "dev env allowed",
);
assert(
  !isDemoSeedEnvironmentAllowed({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
  } as NodeJS.ProcessEnv),
  "production blocked without override",
);
assert(
  isDemoSeedEnvironmentAllowed({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    DEMO_SEED_ALLOW_PRODUCTION: "true",
  } as NodeJS.ProcessEnv),
  "production allowed with explicit override",
);

const seedEnv = validateDemoSeedEnv({
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  DEMO_SEED_TEMP_PASSWORD: "Anytown12345USA",
} as NodeJS.ProcessEnv);
assert(seedEnv.ok === true, "seed env validates with password");

const cleanupEnv = validateDemoSeedCleanupEnv({
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as NodeJS.ProcessEnv);
assert(cleanupEnv.ok === true, "cleanup env does not require password");

const blocked = validateDemoSeedEnv({
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  DEMO_SEED_TEMP_PASSWORD: "Anytown12345USA",
} as NodeJS.ProcessEnv);
assert(blocked.ok === false, "production seed blocked");

console.log("demo-seed foundation.selfcheck: OK");

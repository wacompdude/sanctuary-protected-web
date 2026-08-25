/**
 * Church onboarding validation, including slug uniqueness messaging.
 * Run: npx --yes tsx lib/organization/onboarding.selfcheck.ts
 */
import { validateChurchOnboarding } from "./onboarding";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const base = {
  name: "Grace Community Church",
  primary_email: "office@church.org",
  phone: "555-0100",
  address_line_1: "123 Main",
  city: "Springfield",
  state: "IL",
  postal_code: "62701",
  timezone: "America/Chicago",
  campus_name: "Main Campus",
};

const generated = validateChurchOnboarding(form(base));
assert(generated.data?.slug === "grace-community-church", "slug from name when omitted");

const custom = validateChurchOnboarding(
  form({ ...base, slug: "fcc" }),
);
assert(custom.data?.slug === "fcc", "custom slug accepted");

const invalid = validateChurchOnboarding(
  form({ ...base, slug: "Not Valid!" }),
);
assert(
  Boolean(invalid.fieldErrors?.slug?.includes("lowercase")),
  "invalid slug rejected server-side",
);

const upper = validateChurchOnboarding(form({ ...base, slug: "FCC" }));
assert(upper.data?.slug === "fcc", "slug is lowercased before validate");

const invalidTz = validateChurchOnboarding(
  form({ ...base, timezone: "UTC+1" }),
);
assert(
  Boolean(invalidTz.fieldErrors?.timezone),
  "invalid timezone rejected server-side",
);

const globalTz = validateChurchOnboarding(
  form({ ...base, timezone: "Pacific/Auckland" }),
);
assert(
  globalTz.data?.timezone === "Pacific/Auckland",
  "global IANA timezone accepted",
);

console.log("organization onboarding.selfcheck: ok");

/**
 * Church onboarding validation, including slug uniqueness messaging.
 * Run: npx --yes tsx lib/organization/onboarding.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHURCH_CREATE_GENERIC_ERROR,
  mapChurchCreateRpcError,
  validateChurchOnboarding,
} from "./onboarding";
import {
  generateUniqueOrganizationSlug,
  isOrganizationSlugConflict,
  uniqueOrganizationSlugCandidate,
} from "./slug";

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
assert(
  custom.data?.slug === "grace-community-church",
  "client-supplied slug is ignored; slug always comes from the church name",
);

const invalid = validateChurchOnboarding(
  form({ ...base, slug: "Not Valid!" }),
);
assert(
  !invalid.fieldErrors?.slug,
  "invalid client slug is ignored rather than shown as a field error",
);
assert(
  invalid.data?.slug === "grace-community-church",
  "invalid client slug does not replace the name-derived slug",
);

const upper = validateChurchOnboarding(form({ ...base, slug: "FCC" }));
assert(
  upper.data?.slug === "grace-community-church",
  "client slug is ignored even when it would otherwise be lowercased",
);

const blankName = validateChurchOnboarding(form({ ...base, name: "" }));
assert(
  Boolean(blankName.fieldErrors?.name?.includes("required")),
  "blank church name uses the existing required validation",
);

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

assert(
  uniqueOrganizationSlugCandidate("grace-community-church", 1) ===
    "grace-community-church",
  "first church uses the unsuffixed slug",
);
assert(
  uniqueOrganizationSlugCandidate("grace-community-church", 2) ===
    "grace-community-church-2",
  "second same-name church uses -2",
);
assert(
  uniqueOrganizationSlugCandidate("grace-community-church", 3) ===
    "grace-community-church-3",
  "third same-name church uses -3",
);
assert(
  uniqueOrganizationSlugCandidate("grace-community-church", 4) ===
    "grace-community-church-4",
  "fourth same-name church uses -4",
);

const taken = new Set(["grace-community-church", "grace-community-church-2"]);
assert(
  generateUniqueOrganizationSlug("Grace Community Church", (slug) =>
    taken.has(slug),
  ) === "grace-community-church-3",
  "allocator skips taken slugs with predictable suffixes",
);

const firstWins = new Set<string>();
const concurrentA = generateUniqueOrganizationSlug(
  "Grace Community Church",
  (slug) => firstWins.has(slug),
);
assert(concurrentA === "grace-community-church", "first concurrent create takes the base slug");
firstWins.add(concurrentA!);
const concurrentB = generateUniqueOrganizationSlug(
  "Grace Community Church",
  (slug) => firstWins.has(slug),
);
assert(
  concurrentB === "grace-community-church-2",
  "losing concurrent create retries with -2 instead of duplicating",
);

assert(
  isOrganizationSlugConflict(
    'duplicate key value violates unique constraint "churches_slug_key"',
  ),
  "Postgres UNIQUE constraint name is treated as a slug collision",
);
assert(
  isOrganizationSlugConflict("VALIDATION: This URL name is already in use. Please choose another."),
  "legacy duplicate URL-name validation is treated as a slug collision",
);
assert(
  !isOrganizationSlugConflict("VALIDATION: Primary email is required."),
  "unrelated validation is not treated as a slug collision",
);

const mappedConflict = mapChurchCreateRpcError(
  'duplicate key value violates unique constraint "churches_slug_key"',
);
assert(
  mappedConflict.error === CHURCH_CREATE_GENERIC_ERROR,
  "slug UNIQUE violations are not shown as database errors",
);
assert(
  !mappedConflict.fieldErrors?.slug,
  "slug collisions are not returned as a slug field error",
);

const mappedUnauth = mapChurchCreateRpcError(
  "UNAUTHENTICATED: You must be signed in to create a church.",
);
assert(
  mappedUnauth.error === "You must be signed in to create a church.",
  "unauthenticated creates keep a clear sign-in error",
);

const root = process.cwd();
const pageSource = readFileSync(
  join(root, "app/onboarding/church/page.tsx"),
  "utf8",
);
const formSource = readFileSync(
  join(root, "components/onboarding/church-onboarding-form.tsx"),
  "utf8",
);
const actionSource = readFileSync(
  join(root, "app/onboarding/church/actions.ts"),
  "utf8",
);
assert(
  actionSource.includes("supabase.auth.getUser()"),
  "church creation still requires an authenticated session",
);
assert(
  actionSource.includes("uniqueOrganizationSlugCandidate"),
  "church creation retries unique slug candidates server-side",
);
assert(
  !actionSource.includes("SLUG_DUPLICATE_MESSAGE"),
  "church creation does not show slug-already-exists field errors",
);

assert(pageSource.includes("Create or Join a Church"), "page heading explains create or join");
assert(formSource.includes("Create a New Church"), "form heading for creating a church");
assert(pageSource.includes("Join an Existing Church"), "join heading is present");
assert(
  pageSource.indexOf("join-church-heading") <
    pageSource.indexOf("create-church-heading"),
  "join an existing church is shown above create a new church",
);
assert(
  pageSource.includes("church administrator"),
  "join instructions mention the church administrator",
);
assert(
  pageSource.toLowerCase().includes("email address you used") ||
    pageSource.includes("Your account email:"),
  "join instructions tell the user to share their login email",
);
assert(
  !/platform administrator/i.test(pageSource),
  "onboarding page does not mention Platform Administrator",
);
assert(
  !/super admin/i.test(pageSource),
  "onboarding page does not mention Super Admin",
);
assert(
  !/platform administrator/i.test(formSource),
  "onboarding form does not mention Platform Administrator",
);
assert(
  !formSource.includes("SlugField"),
  "onboarding form does not render a slug field",
);
assert(
  !formSource.includes("URL Name"),
  "onboarding form does not mention URL Name",
);
assert(
  !/name=["']slug["']/.test(formSource),
  "onboarding form does not include a slug input",
);

console.log("organization onboarding.selfcheck: ok");

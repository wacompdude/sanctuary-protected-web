/**
 * Organization slug generation and auto/manual mode.
 * Run: npx --yes tsx lib/organization/slug.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { slugifyCampusName } from "../campuses/constants";
import { validateCampusForm } from "../campuses/validation";
import { CAMPUS_SLUG_HELP, SLUG_HELP } from "./field-help";
import { validateChurchOnboarding } from "./onboarding";
import { canManageCampuses } from "../campuses/permissions";
import { canManageChurchSettings } from "./settings";
import {
  isValidOrganizationSlug,
  SLUG_DUPLICATE_MESSAGE,
  SLUG_FIELD_LABEL,
  slugAfterNameChange,
  slugifyOrganizationName,
  type OrganizationSlugMode,
} from "./slug";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(slugifyOrganizationName("First Church") === "first-church", "spaces to hyphens, lowercase");
assert(
  slugifyOrganizationName("First Church of the First Church") ===
    "first-church-of-the-first-church",
  "full name slug",
);
assert(
  slugifyOrganizationName("St. John's Community Church") ===
    "st-john-s-community-church",
  "punctuation becomes hyphens (matches SQL regexp_replace)",
);
assert(slugifyOrganizationName("Grace   Church") === "grace-church", "collapse spaces");
assert(
  slugifyOrganizationName("Church & Community Center") ===
    "church-community-center",
  "ampersand becomes hyphen gap",
);
assert(slugifyOrganizationName("  Grace Church  ") === "grace-church", "trim");
assert(slugifyOrganizationName("") === "", "empty name stays empty");
assert(slugifyOrganizationName("!!!") === "church", "punctuation-only fallback");
assert(isValidOrganizationSlug("first-church"), "valid slug");
assert(!isValidOrganizationSlug("First Church"), "uppercase invalid");
assert(!isValidOrganizationSlug("-leading"), "leading hyphen invalid");
assert(!isValidOrganizationSlug("trailing-"), "trailing hyphen invalid");

let mode: OrganizationSlugMode = "auto";
let slug = slugAfterNameChange(mode, "First Church of the First Church", "");
assert(slug === "first-church-of-the-first-church", "auto from name");

slug = slugAfterNameChange(mode, "First Church of the First Church - Main", slug);
assert(slug === "first-church-of-the-first-church-main", "auto updates with name");

mode = "manual";
slug = "fcotfc";
slug = slugAfterNameChange(mode, "First Church of the First Church - Main", slug);
assert(slug === "fcotfc", "manual slug survives name change");

mode = "auto";
slug = slugAfterNameChange(mode, "First Church of the First Church - Main", slug);
assert(slug === "first-church-of-the-first-church-main", "reset to auto regenerates");

assert(slugifyCampusName("North Campus") === "north-campus", "campus slug from name");
assert(
  slugAfterNameChange("auto", "North Campus", "", slugifyCampusName) ===
    "north-campus",
  "campus auto-generate",
);
assert(
  slugAfterNameChange("manual", "South Campus", "north-campus", slugifyCampusName) ===
    "north-campus",
  "campus manual override is preserved",
);

assert(SLUG_FIELD_LABEL.includes("URL Name"), "friendly label");
assert(!SLUG_HELP.includes("http"), "org help does not invent a URL");
assert(!SLUG_HELP.toLowerCase().includes("sanctuaryprotected.com"), "org help has no fake domain");
assert(!CAMPUS_SLUG_HELP.includes("http"), "campus help does not invent a URL");
assert(SLUG_DUPLICATE_MESSAGE.includes("already in use"), "duplicate message");

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

const invalidOrg = validateChurchOnboarding(
  form({
    name: "Grace Community Church",
    primary_email: "office@church.org",
    phone: "555-0100",
    address_line_1: "123 Main",
    city: "Springfield",
    state: "IL",
    postal_code: "62701",
    timezone: "America/Chicago",
    campus_name: "Main Campus",
    slug: "Not Valid!",
  }),
);
assert(Boolean(invalidOrg.fieldErrors?.slug), "invalid organization slug rejected");

const invalidCampus = validateCampusForm(
  form({
    name: "London Campus",
    campus_type: "satellite",
    status: "active",
    slug: "Not Valid!",
  }),
);
assert(Boolean(invalidCampus.fieldErrors?.slug), "invalid campus slug rejected");

assert(canManageChurchSettings("administrator"), "admins may edit organization slug");
assert(!canManageChurchSettings("security_member"), "unauthorized role cannot edit organization slug");
assert(canManageCampuses("administrator"), "admins may edit campus slug");
assert(!canManageCampuses("security_member"), "unauthorized role cannot edit campus slug");

const root = process.cwd();
const onboardingSource = readFileSync(
  join(root, "components/onboarding/church-onboarding-form.tsx"),
  "utf8",
);
const settingsSource = readFileSync(
  join(root, "components/settings/church-general-form.tsx"),
  "utf8",
);
const campusSource = readFileSync(
  join(root, "components/campuses/campus-form.tsx"),
  "utf8",
);
assert(onboardingSource.includes("SlugField"), "onboarding uses shared slug field");
assert(settingsSource.includes("SlugField"), "organization settings use shared slug field");
assert(campusSource.includes("SlugField"), "campus settings use shared slug field");
assert(settingsSource.includes('useState<OrganizationSlugMode>("manual")'), "existing org slug starts manual");
assert(campusSource.includes('mode === "create" ? "auto" : "manual"'), "new campus auto; existing campus manual");

console.log("organization slug.selfcheck: ok");

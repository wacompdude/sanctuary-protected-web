/**
 * Global IANA timezone catalog, search, and server validation.
 * Run: npx --yes tsx lib/datetime/timezones.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateCampusForm } from "../campuses/validation";
import { validateChurchOnboarding } from "../organization/onboarding";
import { validateGeneralSettings } from "../organization/settings";
import {
  getTimeZoneOption,
  getTimeZoneUtcOffset,
  isValidIanaTimeZone,
  listIanaTimeZones,
  parseTimeZoneInput,
  searchTimeZones,
  shouldSuggestDeviceTimeZone,
} from "./timezones";

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

function searchIds(query: string): string[] {
  return searchTimeZones(query, 80).map((option) => option.id);
}

function assertSearchHits(query: string, id: string) {
  assert(
    searchIds(query).includes(id),
    `search "${query}" should include ${id}`,
  );
}

const zones = listIanaTimeZones();
assert(zones.includes("America/Los_Angeles"), "Americas zones appear");
assert(zones.includes("America/New_York"), "America/New_York is available");
assert(zones.includes("Europe/London"), "European zones appear");
assert(zones.includes("Europe/Paris"), "Europe/Paris is available");
assert(zones.includes("Africa/Johannesburg"), "African zones appear");
assert(zones.includes("Asia/Tokyo"), "Asian zones appear");
assert(zones.includes("Asia/Dubai"), "Asia/Dubai is available");
assert(zones.includes("Australia/Sydney"), "Australian zones appear");
assert(zones.includes("Pacific/Auckland"), "Pacific zones appear");
assert(zones.includes("UTC"), "UTC is selectable");
assert(
  zones.filter((zone) => zone.startsWith("Europe/")).length > 5,
  "list is not limited to the Americas",
);

assertSearchHits("Seattle", "America/Los_Angeles");
assertSearchHits("Los Angeles", "America/Los_Angeles");
assertSearchHits("New York", "America/New_York");
assertSearchHits("London", "Europe/London");
assertSearchHits("Paris", "Europe/Paris");
assertSearchHits("Tokyo", "Asia/Tokyo");
assertSearchHits("Dubai", "Asia/Dubai");
assertSearchHits("Sydney", "Australia/Sydney");
assertSearchHits("Auckland", "Pacific/Auckland");
assertSearchHits("Johannesburg", "Africa/Johannesburg");
assertSearchHits("America/Los_Angeles", "America/Los_Angeles");
assertSearchHits("europe/london", "Europe/London");
assertSearchHits("LONDON", "Europe/London");
assertSearchHits("United Kingdom", "Europe/London");
assertSearchHits("Japan", "Asia/Tokyo");
assertSearchHits("UTC", "UTC");

const seattle = searchTimeZones("Seattle", 5)[0];
assert(seattle?.id === "America/Los_Angeles", "Seattle ranks Pacific Time first");
assert(
  Boolean(seattle?.primaryLabel && seattle?.secondaryLabel.includes("America/Los_Angeles")),
  "results use a friendly label plus the IANA id",
);

assert(isValidIanaTimeZone("Pacific/Auckland"), "valid IANA accepted");
assert(isValidIanaTimeZone("UTC"), "UTC accepted");
assert(!isValidIanaTimeZone("MyFavoriteTimezone"), "invented zone rejected");
assert(!isValidIanaTimeZone("UTC-8"), "fixed UTC offset rejected");
assert(!isValidIanaTimeZone("GMT-5"), "fixed GMT offset rejected");
assert(!isValidIanaTimeZone("CST"), "ambiguous abbreviation rejected");

const onboardingOk = validateChurchOnboarding(
  form({
    name: "Grace Community Church",
    primary_email: "office@church.org",
    phone: "555-0100",
    address_line_1: "123 Main",
    city: "London",
    state: "England",
    postal_code: "SW1A 1AA",
    timezone: "Europe/London",
    campus_name: "Main Campus",
  }),
);
assert(onboardingOk.data?.timezone === "Europe/London", "onboarding stores IANA id");

const onboardingBad = validateChurchOnboarding(
  form({
    name: "Grace Community Church",
    primary_email: "office@church.org",
    phone: "555-0100",
    address_line_1: "123 Main",
    city: "London",
    state: "England",
    postal_code: "SW1A 1AA",
    timezone: "UTC+1",
    campus_name: "Main Campus",
  }),
);
assert(
  Boolean(onboardingBad.fieldErrors?.timezone),
  "invalid timezone rejected on organization create",
);

const settingsOk = validateGeneralSettings(
  form({
    name: "Grace Community Church",
    slug: "grace-community-church",
    timezone: "Asia/Tokyo",
    week_starts_on: "0",
  }),
);
assert(settingsOk.data?.timezone === "Asia/Tokyo", "organization edit stores IANA id");

const settingsBad = validateGeneralSettings(
  form({
    name: "Grace Community Church",
    slug: "grace-community-church",
    timezone: "CST",
    week_starts_on: "0",
  }),
);
assert(
  Boolean(settingsBad.fieldErrors?.timezone),
  "invalid timezone rejected on organization edit",
);

const campusOk = validateCampusForm(
  form({
    name: "London Campus",
    campus_type: "satellite",
    status: "active",
    timezone: "Europe/London",
  }),
);
assert(campusOk.data?.timezone === "Europe/London", "campus stores IANA id");

const campusBad = validateCampusForm(
  form({
    name: "London Campus",
    campus_type: "satellite",
    status: "active",
    timezone: "GMT-5",
  }),
);
assert(Boolean(campusBad.fieldErrors?.timezone), "invalid campus timezone rejected");

const fieldErrors: Record<string, string> = {};
assert(
  parseTimeZoneInput("Australia/Sydney", fieldErrors) === "Australia/Sydney",
  "parseTimeZoneInput keeps canonical IANA ids",
);

const winter = getTimeZoneUtcOffset(
  "America/Los_Angeles",
  new Date("2026-01-15T12:00:00Z"),
);
const summer = getTimeZoneUtcOffset(
  "America/Los_Angeles",
  new Date("2026-07-15T12:00:00Z"),
);
assert(winter !== summer, "Los Angeles offset changes with daylight saving");
assert(/08/.test(winter), `winter Pacific offset should be UTC-08, got ${winter}`);
assert(/07/.test(summer), `summer Pacific offset should be UTC-07, got ${summer}`);

const londonWinter = getTimeZoneUtcOffset(
  "Europe/London",
  new Date("2026-01-15T12:00:00Z"),
);
const londonSummer = getTimeZoneUtcOffset(
  "Europe/London",
  new Date("2026-07-15T12:00:00Z"),
);
assert(londonWinter !== londonSummer, "London offset changes with BST");

const option = getTimeZoneOption("America/Los_Angeles");
assert(Boolean(option?.offset), "current UTC offset is displayed");
assert(option?.id === "America/Los_Angeles", "canonical id is stored, not PST/PDT");

assert(
  shouldSuggestDeviceTimeZone({ enabled: false, currentValue: "America/Chicago" }) ===
    false,
  "device suggestion does not run on existing settings forms",
);
assert(
  shouldSuggestDeviceTimeZone({ enabled: true, currentValue: "Europe/London" }) ===
    false,
  "device suggestion does not overwrite a chosen timezone",
);
assert(
  shouldSuggestDeviceTimeZone({ enabled: true, currentValue: null }) === true,
  "new organization may suggest the device timezone",
);

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
assert(
  onboardingSource.includes("suggestDeviceTimeZone"),
  "organization creation may suggest the device timezone",
);
assert(
  !settingsSource.includes("suggestDeviceTimeZone"),
  "organization settings do not auto-replace the saved timezone",
);
assert(
  !campusSource.includes("suggestDeviceTimeZone"),
  "campus settings do not auto-replace the saved timezone",
);
assert(
  settingsSource.includes("TimeZoneSelector") &&
    campusSource.includes("TimeZoneSelector") &&
    onboardingSource.includes("TimeZoneSelector"),
  "the same timezone selector is reused",
);

console.log("datetime timezones.selfcheck: ok");

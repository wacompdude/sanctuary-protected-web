import { DEFAULT_CHURCH_TIMEZONE } from "@/lib/datetime/format";

const IANA_ID_PATTERN = /^[A-Za-z0-9_+\-/]+$/;

/** Search terms that are not IANA city names but should still find a zone. */
const ZONE_SEARCH_ALIASES: Record<string, string[]> = {
  "America/Los_Angeles": [
    "seattle",
    "san francisco",
    "portland",
    "las vegas",
    "san diego",
    "sacramento",
    "oakland",
    "pacific",
    "pst",
    "pdt",
    "united states",
    "usa",
  ],
  "America/New_York": [
    "boston",
    "miami",
    "washington",
    "washington dc",
    "philadelphia",
    "atlanta",
    "detroit",
    "new york city",
    "nyc",
    "eastern",
    "est",
    "edt",
    "united states",
    "usa",
  ],
  "America/Chicago": [
    "dallas",
    "houston",
    "austin",
    "minneapolis",
    "new orleans",
    "central",
    "cst",
    "cdt",
    "united states",
    "usa",
  ],
  "America/Denver": [
    "salt lake city",
    "albuquerque",
    "mountain",
    "mst",
    "mdt",
    "united states",
    "usa",
  ],
  "America/Phoenix": ["arizona"],
  "America/Toronto": ["canada", "ontario"],
  "America/Vancouver": ["canada", "british columbia"],
  "America/Edmonton": ["calgary", "canada"],
  "America/Winnipeg": ["canada"],
  "America/Halifax": ["canada"],
  "America/Sao_Paulo": ["brazil", "são paulo", "sao paulo"],
  "America/Mexico_City": ["mexico"],
  "Europe/London": [
    "united kingdom",
    "uk",
    "britain",
    "england",
    "scotland",
    "gmt",
    "bst",
  ],
  "Europe/Paris": ["france", "cet", "cest"],
  "Europe/Berlin": ["germany"],
  "Europe/Rome": ["italy"],
  "Europe/Madrid": ["spain"],
  "Europe/Amsterdam": ["netherlands"],
  "Europe/Dublin": ["ireland"],
  "Asia/Tokyo": ["japan", "jst"],
  "Asia/Seoul": ["south korea", "korea", "kst"],
  "Asia/Singapore": ["singapore"],
  "Asia/Dubai": ["uae", "united arab emirates"],
  "Asia/Kolkata": ["india", "mumbai", "bombay", "delhi", "ist"],
  "Asia/Shanghai": ["china", "beijing", "peking"],
  "Asia/Hong_Kong": ["hong kong"],
  "Australia/Sydney": ["australia"],
  "Australia/Melbourne": ["australia"],
  "Australia/Perth": ["australia"],
  "Pacific/Auckland": ["new zealand"],
  "Africa/Johannesburg": ["south africa"],
  "Africa/Cairo": ["egypt"],
  "Africa/Nairobi": ["kenya"],
  UTC: ["utc", "gmt", "zulu"],
};

/** Used only when `Intl.supportedValuesOf("timeZone")` is unavailable. */
const FALLBACK_IANA_ZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu",
] as const;

const REGION_LABELS: Record<string, string> = {
  Africa: "Africa",
  America: "Americas",
  Antarctica: "Antarctica",
  Arctic: "Arctic",
  Asia: "Asia",
  Atlantic: "Atlantic",
  Australia: "Australia",
  Europe: "Europe",
  Indian: "Indian Ocean",
  Pacific: "Pacific",
  Etc: "Other",
  UTC: "UTC",
};

export type TimeZoneOption = {
  id: string;
  city: string;
  region: string;
  group: string;
  genericName: string;
  shortName: string;
  offset: string;
  searchText: string;
  primaryLabel: string;
  secondaryLabel: string;
};

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatOffset(timeZone: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const raw = partValue(parts, "timeZoneName") || "GMT";
    return raw.replace(/^GMT/, "UTC");
  } catch {
    return "";
  }
}

function formatZoneName(
  timeZone: string,
  at: Date,
  timeZoneName: Intl.DateTimeFormatOptions["timeZoneName"],
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName,
    }).formatToParts(at);
    return partValue(parts, "timeZoneName");
  } catch {
    return "";
  }
}

function cityFromId(id: string): string {
  if (id === "UTC") return "UTC";
  const segment = id.split("/").pop() ?? id;
  return segment.replace(/_/g, " ");
}

function regionFromId(id: string): string {
  if (id === "UTC") return "UTC";
  return id.split("/")[0] ?? id;
}

export function listIanaTimeZones(): string[] {
  const zones = new Set<string>(["UTC"]);
  try {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      for (const zone of Intl.supportedValuesOf("timeZone")) {
        zones.add(zone);
      }
    } else {
      for (const zone of FALLBACK_IANA_ZONES) zones.add(zone);
    }
  } catch {
    for (const zone of FALLBACK_IANA_ZONES) zones.add(zone);
  }
  if (zones.size <= 1) {
    for (const zone of FALLBACK_IANA_ZONES) zones.add(zone);
  }
  return [...zones].sort((a, b) => a.localeCompare(b));
}

export function getTimeZoneUtcOffset(timeZone: string, at = new Date()): string {
  return formatOffset(timeZone, at);
}

export function shouldSuggestDeviceTimeZone(args: {
  enabled: boolean;
  currentValue?: string | null;
}): boolean {
  if (!args.enabled) return false;
  const current = args.currentValue?.trim();
  return !current || current === DEFAULT_CHURCH_TIMEZONE;
}

export function isValidIanaTimeZone(value: string): boolean {
  const timeZone = value.trim();
  if (!timeZone || timeZone.length > 64) return false;
  if (/^(UTC|GMT)[+-]/i.test(timeZone)) return false;
  if (!IANA_ID_PATTERN.test(timeZone)) return false;
  // Abbreviations such as CST/EST are accepted by some Intl implementations
  // but are ambiguous and are not canonical IANA identifiers.
  if (!timeZone.includes("/") && timeZone !== "UTC") return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function detectDeviceTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

function buildOption(id: string, at: Date): TimeZoneOption {
  const city = cityFromId(id);
  const region = regionFromId(id);
  const group = REGION_LABELS[region] ?? region;
  const genericName =
    formatZoneName(id, at, "longGeneric") ||
    formatZoneName(id, at, "long") ||
    city;
  const shortName = formatZoneName(id, at, "short");
  const offset = formatOffset(id, at);
  const aliases = ZONE_SEARCH_ALIASES[id] ?? [];
  const searchText = [
    id,
    id.replace(/_/g, " "),
    city,
    region,
    group,
    genericName,
    shortName,
    offset,
    ...aliases,
  ]
    .join(" ")
    .toLowerCase();

  return {
    id,
    city,
    region,
    group,
    genericName,
    shortName,
    offset,
    searchText,
    primaryLabel: id === "UTC" ? "UTC" : `${city} — ${genericName}`,
    secondaryLabel: offset ? `${id} · ${offset}` : id,
  };
}

let catalogCache: TimeZoneOption[] | null = null;

export function getTimeZoneCatalog(): TimeZoneOption[] {
  if (!catalogCache) {
    const at = new Date();
    catalogCache = listIanaTimeZones().map((id) => buildOption(id, at));
  }
  return catalogCache;
}

export function getTimeZoneOption(id: string): TimeZoneOption | undefined {
  const exact = getTimeZoneCatalog().find((option) => option.id === id);
  if (exact) return exact;
  if (!isValidIanaTimeZone(id)) return undefined;
  return buildOption(id, new Date());
}

function scoreMatch(option: TimeZoneOption, query: string): number {
  const haystack = option.searchText;
  const compactId = option.id.toLowerCase();
  const city = option.city.toLowerCase();
  if (compactId === query || city === query) return 100;
  if (city.startsWith(query) || compactId.endsWith(`/${query.replace(/\s+/g, "_")}`)) {
    return 80;
  }
  if (haystack.includes(` ${query} `) || haystack.startsWith(`${query} `)) return 60;
  if (haystack.includes(query)) return 40;
  return 0;
}

export function searchTimeZones(query: string, limit = 80): TimeZoneOption[] {
  const catalog = getTimeZoneCatalog();
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const pinned = [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "Europe/London",
      "Europe/Paris",
      "Asia/Tokyo",
      "Asia/Dubai",
      "Australia/Sydney",
      "Pacific/Auckland",
      "Africa/Johannesburg",
    ];
    const head = pinned
      .map((id) => catalog.find((option) => option.id === id))
      .filter((option): option is TimeZoneOption => Boolean(option));
    const rest = catalog.filter((option) => !pinned.includes(option.id));
    return [...head, ...rest].slice(0, limit);
  }

  return catalog
    .map((option) => ({ option, score: scoreMatch(option, normalized) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.option.city.localeCompare(b.option.city))
    .slice(0, limit)
    .map((row) => row.option);
}

export function parseTimeZoneInput(
  value: string,
  fieldErrors: Record<string, string>,
  key = "timezone",
  required = true,
): string {
  const timeZone = value.trim();
  if (!timeZone) {
    if (required) fieldErrors[key] = "Time zone is required.";
    return "";
  }
  if (!isValidIanaTimeZone(timeZone)) {
    fieldErrors[key] = "Select a valid time zone.";
    return timeZone;
  }
  return timeZone;
}

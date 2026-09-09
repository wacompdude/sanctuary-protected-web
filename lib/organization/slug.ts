export const ORGANIZATION_SLUG_MAX = 80;
export const ORGANIZATION_SLUG_FALLBACK = "church";
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ORGANIZATION_SLUG_MAX_ALLOCATION_ATTEMPTS = 50;

export const SLUG_FIELD_LABEL = "URL Name (slug)";
export const SLUG_HELP_LABEL = "URL Name help";
export const SLUG_REQUIRED_MESSAGE = "URL name is required.";
export const SLUG_FORMAT_MESSAGE =
  "Use lowercase letters, numbers, and hyphens only (e.g. grace-community).";
export const SLUG_DUPLICATE_MESSAGE =
  "This URL name is already in use. Please choose another.";

export type OrganizationSlugMode = "auto" | "manual";

/**
 * URL-friendly organization slug. Matches the SQL used when creating a church:
 * lowercase, non-alphanumerics → hyphen, trim hyphens, max 80 characters.
 */
export function slugifyOrganizationName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ORGANIZATION_SLUG_MAX)
    .replace(/-+$/g, "");

  return slug || ORGANIZATION_SLUG_FALLBACK;
}

function clipOrganizationSlug(value: string): string {
  return value
    .slice(0, ORGANIZATION_SLUG_MAX)
    .replace(/-+$/g, "") || ORGANIZATION_SLUG_FALLBACK;
}

/**
 * Candidate slug for a create attempt.
 * Attempt 1 is the base slug; 2 becomes `base-2`, 3 becomes `base-3`, and so on.
 * The database UNIQUE constraint remains the authority — callers must retry on conflict.
 */
export function uniqueOrganizationSlugCandidate(
  baseSlug: string,
  attempt: number,
): string {
  const normalized =
    isValidOrganizationSlug(baseSlug) && baseSlug.length <= ORGANIZATION_SLUG_MAX
      ? baseSlug
      : clipOrganizationSlug(
          slugifyOrganizationName(baseSlug) || ORGANIZATION_SLUG_FALLBACK,
        );

  if (attempt <= 1) {
    return normalized;
  }

  const suffix = `-${attempt}`;
  const maxBaseLength = ORGANIZATION_SLUG_MAX - suffix.length;
  const truncated = normalized
    .slice(0, Math.max(1, maxBaseLength))
    .replace(/-+$/g, "");
  return `${truncated || ORGANIZATION_SLUG_FALLBACK}${suffix}`;
}

/**
 * Next unused slug from a name, using predictable numeric suffixes.
 * For tests and collision planning only — do not treat a pre-check as sufficient
 * uniqueness. Concurrent creates must still handle UNIQUE violations.
 */
export function generateUniqueOrganizationSlug(
  name: string,
  isTaken: (slug: string) => boolean,
  maxAttempts = ORGANIZATION_SLUG_MAX_ALLOCATION_ATTEMPTS,
): string | null {
  const base =
    slugifyOrganizationName(name) || ORGANIZATION_SLUG_FALLBACK;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = uniqueOrganizationSlugCandidate(base, attempt);
    if (!isTaken(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** True when a Postgres / RPC error is a slug uniqueness collision. */
export function isOrganizationSlugConflict(message: string): boolean {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("churches_slug_key") ||
    normalized.includes("organizations_slug_key")
  ) {
    return true;
  }
  if (normalized.includes("duplicate") && normalized.includes("slug")) {
    return true;
  }
  if (
    normalized.includes("already in use") &&
    (normalized.includes("slug") || normalized.includes("url name"))
  ) {
    return true;
  }
  return false;
}

export function isValidOrganizationSlug(value: string): boolean {
  return (
    ORGANIZATION_SLUG_PATTERN.test(value) &&
    value.length > 0 &&
    value.length <= ORGANIZATION_SLUG_MAX
  );
}

/** While auto, name edits replace the slug. Manual edits are left alone. */
export function slugAfterNameChange(
  mode: OrganizationSlugMode,
  name: string,
  currentSlug: string,
  slugify: (name: string) => string = slugifyOrganizationName,
): string {
  return mode === "auto" ? slugify(name) : currentSlug;
}

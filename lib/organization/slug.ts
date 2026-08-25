export const ORGANIZATION_SLUG_MAX = 80;
export const ORGANIZATION_SLUG_FALLBACK = "church";
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

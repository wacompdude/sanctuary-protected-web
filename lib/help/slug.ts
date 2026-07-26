export function slugifyHelpText(value: string, maxLength = 80): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return slug || "item";
}

export function isValidHelpSlug(value: string, maxLength = 120): boolean {
  if (!value || value.length > maxLength) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

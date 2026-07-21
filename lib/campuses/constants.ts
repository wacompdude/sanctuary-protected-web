export const CAMPUS_MIGRATION_HINT =
  "Campus management requires supabase/migrations/036_campus_management.sql. Apply it in the Supabase SQL Editor, then refresh.";

/** Cookie / form value meaning combined authorized campuses. */
export const CAMPUS_FILTER_ALL = "all";

export const CAMPUS_TYPES = [
  { value: "main", label: "Main" },
  { value: "satellite", label: "Satellite" },
  { value: "administrative", label: "Administrative" },
  { value: "school", label: "School" },
  { value: "event_center", label: "Event center" },
  { value: "office", label: "Office" },
  { value: "other", label: "Other" },
] as const;

export const CAMPUS_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
] as const;

/** Statuses available before migration 036 expands the enum. */
export const CAMPUS_STATUSES_LEGACY = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

export function labelForCampusType(value: string): string {
  return CAMPUS_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function labelForCampusStatus(value: string): string {
  return CAMPUS_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export const CAMPUS_ROLES = [
  { value: "campus_leader", label: "Campus leader" },
  { value: "campus_administrator", label: "Campus administrator" },
  { value: "campus_security_leader", label: "Campus security leader" },
  { value: "campus_security_member", label: "Campus security member" },
  { value: "campus_staff", label: "Campus staff" },
  { value: "campus_viewer", label: "Campus viewer" },
] as const;

export const CAMPUS_MEMBERSHIP_STATUSES = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "removed", label: "Removed" },
] as const;

export function labelForCampusRole(value: string): string {
  return CAMPUS_ROLES.find((item) => item.value === value)?.label ?? value;
}

export function labelForCampusMembershipStatus(value: string): string {
  return (
    CAMPUS_MEMBERSHIP_STATUSES.find((item) => item.value === value)?.label ??
    value
  );
}

/** Map church role → default campus role when assigning. */
export function defaultCampusRoleForChurchRole(
  churchRole: string,
): (typeof CAMPUS_ROLES)[number]["value"] {
  switch (churchRole) {
    case "security_leader":
      return "campus_security_leader";
    case "security_member":
      return "campus_security_member";
    case "administrator":
    case "owner":
    case "co_owner":
      return "campus_administrator";
    default:
      return "campus_viewer";
  }
}

export function slugifyCampusName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "campus";
}

export function campusMigrationHintFromError(message: string): string | null {
  if (
    /campuses|campus_memberships|campus_locations|campus_type|is_primary|PGRST205|42P01|does not exist/i.test(
      message,
    )
  ) {
    return CAMPUS_MIGRATION_HINT;
  }
  return null;
}

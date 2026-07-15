import type { MembershipRole } from "@/lib/church/types";

/** Higher number = more privileged. Used for cumulative nav visibility. */
export const MEMBERSHIP_ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 10,
  security_member: 20,
  security_leader: 30,
  administrator: 40,
  owner: 50,
};

export function roleRank(role: MembershipRole): number {
  return MEMBERSHIP_ROLE_RANK[role] ?? 0;
}

export function hasMinRole(
  role: MembershipRole,
  minimum: MembershipRole,
): boolean {
  return roleRank(role) >= roleRank(minimum);
}

export type NavItemId =
  | "dashboard"
  | "incidents"
  | "select-church"
  | "team"
  | "certifications"
  | "security-hardware"
  | "campuses"
  | "security-settings"
  | "church-settings"
  | "invitations"
  | "audit"
  | "ownership"
  | "billing"
  | "account-status"
  | "profile";

export type AppNavItem = {
  id: NavItemId;
  href: string;
  /** Minimum role required to see this item in the nav (not authorization). */
  minRole: MembershipRole;
  /** Default label */
  label: string;
  /** Optional label overrides for specific roles */
  labels?: Partial<Record<MembershipRole, string>>;
};

/**
 * Role-based navigation catalog.
 * Visibility is UX only — every destination must still enforce server-side auth.
 */
export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    minRole: "viewer",
    label: "Dashboard",
  },
  {
    id: "incidents",
    href: "/incidents",
    minRole: "viewer",
    label: "Incidents",
  },
  {
    id: "select-church",
    href: "/select-church",
    minRole: "viewer",
    label: "Switch church",
  },
  {
    id: "team",
    href: "/team",
    minRole: "security_member",
    label: "Team",
    labels: {
      security_member: "Team",
      security_leader: "Team management",
      administrator: "Team management",
      owner: "Team administration",
    },
  },
  {
    id: "certifications",
    href: "/certifications",
    minRole: "security_member",
    label: "Certifications",
    labels: {
      security_leader: "Certification admin",
      administrator: "Certification admin",
      owner: "Certification admin",
    },
  },
  {
    id: "security-hardware",
    href: "/security-hardware",
    minRole: "viewer",
    label: "Security Hardware",
    labels: {
      viewer: "Security Hardware",
      security_member: "Security Hardware",
      security_leader: "Security Hardware",
      administrator: "Hardware inventory",
      owner: "Hardware inventory",
    },
  },
  {
    id: "campuses",
    href: "/campuses",
    minRole: "security_member",
    label: "Campuses",
    labels: {
      security_member: "My campuses",
      security_leader: "Campuses",
      administrator: "Campus management",
      owner: "Campus management",
    },
  },
  {
    id: "security-settings",
    href: "/settings/security",
    minRole: "security_leader",
    label: "Security settings",
  },
  {
    id: "church-settings",
    href: "/settings/church",
    minRole: "security_leader",
    label: "Church settings",
  },
  {
    id: "invitations",
    href: "/team/invite",
    minRole: "administrator",
    label: "Invitations",
  },
  {
    id: "audit",
    href: "/audit",
    minRole: "administrator",
    label: "Audit log",
  },
  {
    id: "ownership",
    href: "/settings/ownership",
    minRole: "owner",
    label: "Ownership",
  },
  {
    id: "billing",
    href: "/settings/billing",
    minRole: "owner",
    label: "Billing",
  },
  {
    id: "account-status",
    href: "/settings/account",
    minRole: "owner",
    label: "Account status",
  },
  {
    id: "profile",
    href: "/profile",
    minRole: "viewer",
    label: "Profile",
  },
];

export function navLabelForRole(
  item: AppNavItem,
  role: MembershipRole,
): string {
  return item.labels?.[role] ?? item.label;
}

export function getNavItemsForRole(role: MembershipRole | null): AppNavItem[] {
  if (!role) {
    // No church context — only profile is safe to show.
    return APP_NAV_ITEMS.filter((item) => item.id === "profile");
  }

  return APP_NAV_ITEMS.filter((item) => hasMinRole(role, item.minRole));
}

/** Roles at or above the minimum (for requireChurchRole-style checks). */
export function rolesAtOrAbove(minimum: MembershipRole): MembershipRole[] {
  const min = roleRank(minimum);
  return (Object.keys(MEMBERSHIP_ROLE_RANK) as MembershipRole[]).filter(
    (role) => roleRank(role) >= min,
  );
}

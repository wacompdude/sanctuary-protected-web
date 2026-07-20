import type { MembershipRole } from "@/lib/church/types";

/** Higher number = more privileged. Used for cumulative nav visibility. */
export const MEMBERSHIP_ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 10,
  security_member: 20,
  security_leader: 30,
  administrator: 40,
  co_owner: 50,
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

/** Leaf destinations and group icon keys used by the sidebar. */
export type NavItemId =
  | "dashboard"
  | "incidents"
  | "policies"
  | "notifications"
  | "notification-inbox"
  | "notification-groups"
  | "notification-preferences"
  | "security-hardware"
  | "medical-supplies"
  | "team"
  | "team-members"
  | "invitations"
  | "certifications"
  | "campuses"
  | "schedule"
  | "schedule-calendar"
  | "schedule-events"
  | "schedule-shifts"
  | "schedule-availability"
  | "schedule-my"
  | "schedule-notifications"
  | "schedule-templates"
  | "scheduling-settings"
  | "settings"
  | "church-settings"
  | "security-settings"
  | "ownership"
  | "billing"
  | "account-status"
  | "audit"
  | "profile"
  // Legacy ids kept so older references compile during transition
  | "select-church";

export type NavLinkItem = {
  kind: "link";
  id: NavItemId;
  href: string;
  label: string;
  minRole: MembershipRole;
};

export type NavGroupItem = {
  kind: "group";
  id: NavItemId;
  label: string;
  minRole: MembershipRole;
  /** Default landing href when the group header is activated. */
  href: string;
  children: NavLinkItem[];
};

export type NavEntry = NavLinkItem | NavGroupItem;

export type NavSection = {
  id: string;
  /** Optional section heading shown above items. */
  label?: string;
  minRole: MembershipRole;
  items: NavEntry[];
};

/**
 * Role-based navigation catalog.
 * Visibility is UX only — every destination must still enforce server-side auth.
 *
 * Organization principles:
 * - Task-based top-level items (ops first)
 * - Related admin destinations nest under groups
 * - Church switcher lives in the sidebar header (not a nav row)
 * - Invite lives under Team (not a duplicate top-level item)
 */
export const APP_NAV_SECTIONS: NavSection[] = [
  {
    id: "operations",
    label: "Operations",
    minRole: "viewer",
    items: [
      {
        kind: "link",
        id: "dashboard",
        href: "/dashboard",
        minRole: "viewer",
        label: "Dashboard",
      },
      {
        kind: "link",
        id: "incidents",
        href: "/incidents",
        minRole: "viewer",
        label: "Incidents",
      },
      {
        kind: "link",
        id: "policies",
        href: "/policies",
        minRole: "viewer",
        label: "Policies & Procedures",
      },
      {
        kind: "group",
        id: "notifications",
        href: "/notifications",
        minRole: "viewer",
        label: "Notifications",
        children: [
          {
            kind: "link",
            id: "notification-inbox",
            href: "/notifications",
            minRole: "viewer",
            label: "Inbox",
          },
          {
            kind: "link",
            id: "notification-groups",
            href: "/notification-groups",
            minRole: "security_leader",
            label: "Groups",
          },
          {
            kind: "link",
            id: "notification-preferences",
            href: "/notifications/preferences",
            minRole: "viewer",
            label: "Preferences",
          },
        ],
      },
      {
        kind: "link",
        id: "security-hardware",
        href: "/security-hardware",
        minRole: "viewer",
        label: "Hardware",
      },
      {
        kind: "link",
        id: "medical-supplies",
        href: "/medical-supplies",
        minRole: "viewer",
        label: "Medical supplies",
      },
    ],
  },
  {
    id: "people",
    label: "People",
    minRole: "viewer",
    items: [
      {
        kind: "group",
        id: "team",
        href: "/team",
        minRole: "security_member",
        label: "Team",
        children: [
          {
            kind: "link",
            id: "team-members",
            href: "/team",
            minRole: "security_member",
            label: "Members",
          },
          {
            kind: "link",
            id: "invitations",
            href: "/team/invite",
            minRole: "administrator",
            label: "Invite",
          },
          {
            kind: "link",
            id: "certifications",
            href: "/certifications",
            minRole: "security_member",
            label: "Certifications",
          },
          {
            kind: "link",
            id: "campuses",
            href: "/campuses",
            minRole: "security_member",
            label: "Campuses",
          },
        ],
      },
      {
        kind: "group",
        id: "schedule",
        href: "/schedule/calendar",
        minRole: "viewer",
        label: "Scheduling",
        children: [
          {
            kind: "link",
            id: "schedule-calendar",
            href: "/schedule/calendar",
            minRole: "viewer",
            label: "Calendar",
          },
          {
            kind: "link",
            id: "schedule-my",
            href: "/schedule/my-schedule",
            minRole: "viewer",
            label: "My Schedule",
          },
          {
            kind: "link",
            id: "schedule-events",
            href: "/schedule/events",
            minRole: "viewer",
            label: "Events",
          },
          {
            kind: "link",
            id: "schedule-shifts",
            href: "/schedule/shifts",
            minRole: "viewer",
            label: "Team Shifts",
          },
          {
            kind: "link",
            id: "schedule-availability",
            href: "/schedule/availability",
            minRole: "viewer",
            label: "Availability",
          },
          {
            kind: "link",
            id: "schedule-notifications",
            href: "/schedule/notifications",
            minRole: "security_leader",
            label: "Schedule Notifications",
          },
          {
            kind: "link",
            id: "schedule-templates",
            href: "/schedule/templates",
            minRole: "security_leader",
            label: "Schedule Templates",
          },
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    minRole: "security_leader",
    items: [
      {
        kind: "group",
        id: "settings",
        href: "/settings/church",
        minRole: "security_leader",
        label: "Settings",
        children: [
          {
            kind: "link",
            id: "church-settings",
            href: "/settings/church",
            minRole: "security_leader",
            label: "Church",
          },
          {
            kind: "link",
            id: "security-settings",
            href: "/settings/security",
            minRole: "security_leader",
            label: "Security",
          },
          {
            kind: "link",
            id: "scheduling-settings",
            href: "/settings/scheduling",
            minRole: "administrator",
            label: "Scheduling",
          },
          {
            kind: "link",
            id: "ownership",
            href: "/settings/ownership",
            minRole: "owner",
            label: "Ownership",
          },
          {
            kind: "link",
            id: "billing",
            href: "/settings/billing",
            minRole: "owner",
            label: "Billing",
          },
          {
            kind: "link",
            id: "account-status",
            href: "/settings/account",
            minRole: "owner",
            label: "Account",
          },
        ],
      },
      {
        kind: "link",
        id: "audit",
        href: "/audit",
        minRole: "administrator",
        label: "Audit log",
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    minRole: "viewer",
    items: [
      {
        kind: "link",
        id: "profile",
        href: "/profile",
        minRole: "viewer",
        label: "Profile",
      },
    ],
  },
];

/** @deprecated Flat catalog — prefer APP_NAV_SECTIONS. Kept for type compatibility. */
export type AppNavItem = {
  id: NavItemId;
  href: string;
  minRole: MembershipRole;
  label: string;
  labels?: Partial<Record<MembershipRole, string>>;
};

function filterLink(
  item: NavLinkItem,
  role: MembershipRole,
): NavLinkItem | null {
  return hasMinRole(role, item.minRole) ? item : null;
}

function filterEntry(entry: NavEntry, role: MembershipRole): NavEntry | null {
  if (entry.kind === "link") {
    return filterLink(entry, role);
  }

  if (!hasMinRole(role, entry.minRole)) return null;

  const children = entry.children
    .map((child) => filterLink(child, role))
    .filter((child): child is NavLinkItem => child != null);

  if (children.length === 0) return null;

  // Single-child groups collapse to a direct link to reduce nesting noise.
  if (children.length === 1) {
    const only = children[0]!;
    return {
      kind: "link",
      id: entry.id,
      href: only.href,
      label: entry.label,
      minRole: entry.minRole,
    };
  }

  return {
    ...entry,
    children,
  };
}

export function getNavSectionsForRole(
  role: MembershipRole | null,
): NavSection[] {
  if (!role) {
    return [
      {
        id: "account",
        items: [
          {
            kind: "link",
            id: "profile",
            href: "/profile",
            minRole: "viewer",
            label: "Profile",
          },
        ],
        minRole: "viewer",
      },
    ];
  }

  return APP_NAV_SECTIONS.map((section) => {
    if (!hasMinRole(role, section.minRole)) return null;

    const items = section.items
      .map((entry) => filterEntry(entry, role))
      .filter((entry): entry is NavEntry => entry != null);

    if (items.length === 0) return null;

    return {
      ...section,
      items,
    };
  }).filter((section): section is NavSection => section != null);
}

/** Flat list of visible links (useful for tests / legacy callers). */
export function getNavItemsForRole(role: MembershipRole | null): AppNavItem[] {
  const sections = getNavSectionsForRole(role);
  const items: AppNavItem[] = [];

  for (const section of sections) {
    for (const entry of section.items) {
      if (entry.kind === "link") {
        items.push({
          id: entry.id,
          href: entry.href,
          minRole: entry.minRole,
          label: entry.label,
        });
      } else {
        for (const child of entry.children) {
          items.push({
            id: child.id,
            href: child.href,
            minRole: child.minRole,
            label: child.label,
          });
        }
      }
    }
  }

  return items;
}

export function navLabelForRole(
  item: AppNavItem,
  role: MembershipRole,
): string {
  return item.labels?.[role] ?? item.label;
}

/** Roles at or above the minimum (for requireChurchRole-style checks). */
export function rolesAtOrAbove(minimum: MembershipRole): MembershipRole[] {
  const min = roleRank(minimum);
  return (Object.keys(MEMBERSHIP_ROLE_RANK) as MembershipRole[]).filter(
    (role) => roleRank(role) >= min,
  );
}

import type { MembershipRole } from "@/lib/organization/types";
import { applyNavFeatureLocks } from "@/lib/subscriptions/nav-locks";

/** Higher number = more privileged. Used for cumulative nav visibility. */
export const MEMBERSHIP_ROLE_RANK: Record<MembershipRole, number> = {
  viewer: 10,
  pastor: 10,
  event_coordinator: 15,
  training_coordinator: 16,
  medical_coordinator: 16,
  hardware_manager: 16,
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
  | "safety-concerns"
  | "safety-concerns-settings"
  | "team"
  | "team-members"
  | "invitations"
  | "certifications"
  | "training"
  | "training-dashboard"
  | "training-events"
  | "training-courses"
  | "training-calendar"
  | "training-records"
  | "training-required"
  | "training-reports"
  | "training-settings"
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
  | "dashboard-settings"
  | "settings"
  | "church-settings"
  | "security-settings"
  | "ownership"
  | "billing"
  | "account-status"
  | "audit"
  | "help"
  | "profile"
  | "cameras"
  | "sensors"
  | "subscription-plans"
  // Legacy ids kept so older references compile during transition
  | "select-church";

export type NavLinkItem = {
  kind: "link";
  id: NavItemId;
  href: string;
  label: string;
  minRole: MembershipRole;
  locked?: boolean;
  featureKey?: string;
};

export type NavGroupItem = {
  kind: "group";
  id: NavItemId;
  label: string;
  minRole: MembershipRole;
  /** Default landing href when the group header is activated. */
  href: string;
  children: NavLinkItem[];
  locked?: boolean;
  featureKey?: string;
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
 * - Ops work first (incidents, alerts, assets, coverage)
 * - People & readiness next (team, training)
 * - Admin / account last
 * - Related destinations nest under groups; short labels under a clear parent
 * - Church switcher lives in the sidebar header (not a nav row)
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
            id: "notification-preferences",
            href: "/notifications/preferences",
            minRole: "viewer",
            label: "Preferences",
          },
          {
            kind: "link",
            id: "notification-groups",
            href: "/notification-groups",
            minRole: "security_leader",
            label: "Groups",
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
            id: "schedule-my",
            href: "/schedule/my-schedule",
            minRole: "viewer",
            label: "My Schedule",
          },
          {
            kind: "link",
            id: "schedule-calendar",
            href: "/schedule/calendar",
            minRole: "viewer",
            label: "Calendar",
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
            label: "Notifications",
          },
          {
            kind: "link",
            id: "schedule-templates",
            href: "/schedule/templates",
            minRole: "security_leader",
            label: "Templates",
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
        label: "Medical Supplies",
      },
      {
        kind: "link",
        id: "safety-concerns",
        href: "/safety-concerns",
        minRole: "security_member",
        label: "Safety Concerns",
      },
      {
        kind: "link",
        id: "policies",
        href: "/policies",
        minRole: "viewer",
        label: "Policies & Procedures",
      },
      {
        kind: "link",
        id: "cameras",
        href: "/cameras",
        minRole: "viewer",
        label: "Cameras",
      },
      {
        kind: "link",
        id: "sensors",
        href: "/sensors",
        minRole: "viewer",
        label: "Sensors",
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
        ],
      },
      {
        kind: "group",
        id: "training",
        href: "/training",
        minRole: "security_member",
        label: "Training",
        children: [
          {
            kind: "link",
            id: "training-dashboard",
            href: "/training",
            minRole: "security_member",
            label: "Dashboard",
          },
          {
            kind: "link",
            id: "training-calendar",
            href: "/training/calendar",
            minRole: "security_member",
            label: "Calendar",
          },
          {
            kind: "link",
            id: "training-events",
            href: "/training/events",
            minRole: "security_member",
            label: "Events",
          },
          {
            kind: "link",
            id: "training-courses",
            href: "/training/courses",
            minRole: "security_member",
            label: "Courses",
          },
          {
            kind: "link",
            id: "training-records",
            href: "/training/records",
            minRole: "security_member",
            label: "Records",
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
            id: "training-required",
            href: "/training/required",
            minRole: "security_leader",
            label: "Required",
          },
          {
            kind: "link",
            id: "training-reports",
            href: "/training/reports",
            minRole: "security_leader",
            label: "Reports",
          },
          {
            kind: "link",
            id: "training-settings",
            href: "/training/settings",
            minRole: "administrator",
            label: "Settings",
          },
        ],
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    minRole: "security_member",
    items: [
      {
        kind: "link",
        id: "campuses",
        href: "/campuses",
        minRole: "security_member",
        label: "Campuses",
      },
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
            id: "safety-concerns-settings",
            href: "/settings/safety-concerns",
            minRole: "administrator",
            label: "Safety Concerns",
          },
          {
            kind: "link",
            id: "dashboard-settings",
            href: "/settings/dashboard",
            minRole: "administrator",
            label: "Dashboard",
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
            id: "subscription-plans",
            href: "/settings/plans",
            minRole: "security_leader",
            label: "Subscription",
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
        id: "help",
        href: "/help",
        minRole: "viewer",
        label: "Help Center",
      },
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
  // Keep the group label when the only child is the group's landing page
  // (e.g. Team → Members at /team). Otherwise expose the child's own label
  // (e.g. Training with only Certifications → "Certifications").
  if (children.length === 1) {
    const only = children[0]!;
    if (only.href !== entry.href) {
      return only;
    }
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
  options?: {
    /** Feature keys the church currently has enabled (from entitlements). */
    enabledFeatures?: ReadonlySet<string>;
    /** Keep Safety Concerns unlocked for leadership read-only after downgrade. */
    keepSafetyConcernsAvailable?: boolean;
  },
): NavSection[] {
  if (!role) {
    return [
      {
        id: "account",
        items: [
          {
            kind: "link",
            id: "help",
            href: "/help",
            minRole: "viewer",
            label: "Help Center",
          },
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

  const membershipRole = role;
  const enabledFeatures = options?.enabledFeatures;

  const sections = APP_NAV_SECTIONS.map((section) => {
    if (!hasMinRole(membershipRole, section.minRole)) return null;

    const items = section.items
      .map((entry) => filterEntry(entry, membershipRole))
      .filter((entry): entry is NavEntry => entry != null);

    if (items.length === 0) return null;

    return {
      ...section,
      items,
    };
  }).filter((section): section is NavSection => section != null);

  if (!enabledFeatures) return sections;

  return applyNavFeatureLocks(sections, {
    enabledFeatures,
    keepSafetyConcernsAvailable: options?.keepSafetyConcernsAvailable,
  });
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

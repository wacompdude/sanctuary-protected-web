import type { PlatformPermissionKey } from "@/lib/platform/permission-keys";

export type PlatformNavLink = {
  href: string;
  label: string;
  permission: PlatformPermissionKey | null;
};

export type PlatformNavSection = {
  id: string;
  label: string;
  links: PlatformNavLink[];
};

/**
 * Platform console navigation catalog.
 * Hiding links is UX only — pages must call requirePlatformPermission.
 */
export const PLATFORM_NAV_SECTIONS: PlatformNavSection[] = [
  {
    id: "overview",
    label: "Overview",
    links: [
      {
        href: "/platform",
        label: "Dashboard",
        permission: "platform.console.access",
      },
    ],
  },
  {
    id: "churches",
    label: "Churches",
    links: [
      {
        href: "/platform/churches",
        label: "All Churches",
        permission: "churches.read_all",
      },
      {
        href: "/platform/support",
        label: "Support Access",
        permission: "churches.support_access",
      },
    ],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    links: [
      {
        href: "/platform/subscriptions",
        label: "Active Subscriptions",
        permission: "subscriptions.read_all",
      },
      {
        href: "/platform/plans",
        label: "Plans",
        permission: "plans.read",
      },
      {
        href: "/platform/features",
        label: "Feature Catalog",
        permission: "features.read",
      },
    ],
  },
  {
    id: "accounts",
    label: "Platform Accounts",
    links: [
      {
        href: "/platform/accounts",
        label: "Administrators",
        permission: "platform.accounts.read",
      },
      {
        href: "/platform/accounts/new",
        label: "Invite account",
        permission: "platform.accounts.create",
      },
    ],
  },
  {
    id: "demo",
    label: "Demo Environments",
    links: [
      {
        href: "/platform/demo-organizations",
        label: "Demo Churches",
        permission: "demo_organizations.read",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    links: [
      {
        href: "/platform/system/health",
        label: "Health",
        permission: "system.health.read",
      },
      {
        href: "/platform/system/jobs",
        label: "Jobs",
        permission: "system.jobs.read",
      },
      {
        href: "/platform/system/webhooks",
        label: "Webhooks",
        permission: "system.webhooks.read",
      },
      {
        href: "/platform/system/config",
        label: "Provider config",
        permission: "developer.config_status.read",
      },
      {
        href: "/platform/system/demo-seed",
        label: "Demo seed",
        permission: "developer.tools.access",
      },
    ],
  },
  {
    id: "help",
    label: "Help Center",
    links: [
      {
        href: "/platform/help",
        label: "Articles",
        permission: "help.console.access",
      },
      {
        href: "/platform/help/categories",
        label: "Categories",
        permission: "help.console.access",
      },
      {
        href: "/platform/help/analytics",
        label: "Analytics",
        permission: "help.analytics.read",
      },
    ],
  },
  {
    id: "audit",
    label: "Audit",
    links: [
      {
        href: "/platform/audit",
        label: "Platform Activity",
        permission: "audit.platform.read",
      },
    ],
  },
];

export function filterPlatformNavSections(
  permissions: ReadonlySet<string>,
): PlatformNavSection[] {
  return PLATFORM_NAV_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((link) => {
      if (!link.permission) return true;
      return permissions.has(link.permission);
    }),
  })).filter((section) => section.links.length > 0);
}

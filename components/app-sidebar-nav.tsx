"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Award,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Church,
  CircleHelp,
  CreditCard,
  Crown,
  Cross,
  GraduationCap,
  HardDrive,
  Bell,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  MailPlus,
  Menu,
  BookOpen,
  CalendarDays,
  Camera,
  Radio,
  ScrollText,
  Settings2,
  Shield,
  ShieldAlert,
  Users,
  AlertTriangle,
  UserRound,
  X,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { ChurchSwitcher, type ChurchOption } from "@/components/church-switcher";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { UpgradeFeatureDialog } from "@/components/subscriptions/upgrade-feature-dialog";
import { createClient } from "@/lib/supabase/client";
import type {
  NavEntry,
  NavItemId,
  NavLinkItem,
  NavSection,
} from "@/lib/organization/navigation";
import type { MembershipRole } from "@/lib/organization/types";
import type { FeatureLockSummary } from "@/lib/subscriptions/feature-access";

const STORAGE_KEY = "sp-sidebar-collapsed";

const NAV_ICONS: Partial<Record<NavItemId, LucideIcon>> = {
  dashboard: LayoutDashboard,
  incidents: AlertTriangle,
  policies: BookOpen,
  schedule: CalendarDays,
  "schedule-calendar": CalendarDays,
  "schedule-events": CalendarDays,
  "schedule-shifts": CalendarDays,
  "schedule-availability": CalendarDays,
  "schedule-my": CalendarDays,
  "schedule-notifications": Bell,
  "schedule-templates": CalendarDays,
  "scheduling-settings": CalendarDays,
  "safety-concerns-settings": ShieldAlert,
  "dashboard-settings": LayoutDashboard,
  notifications: Bell,
  "notification-inbox": Inbox,
  "notification-groups": Layers,
  "notification-preferences": Bell,
  "security-hardware": HardDrive,
  "medical-supplies": Cross,
  "safety-concerns": ShieldAlert,
  team: Users,
  "team-members": Users,
  invitations: MailPlus,
  certifications: Award,
  training: GraduationCap,
  "training-dashboard": GraduationCap,
  "training-events": GraduationCap,
  "training-courses": GraduationCap,
  "training-calendar": GraduationCap,
  "training-records": GraduationCap,
  "training-required": GraduationCap,
  "training-reports": GraduationCap,
  "training-settings": GraduationCap,
  campuses: Building2,
  settings: Settings2,
  "church-settings": Church,
  "security-settings": Shield,
  ownership: Crown,
  billing: CreditCard,
  "account-status": Activity,
  audit: ScrollText,
  help: CircleHelp,
  profile: UserRound,
  cameras: Camera,
  sensors: Radio,
  "subscription-plans": CreditCard,
};

function pathMatches(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  // Avoid /notifications matching /notifications/preferences incorrectly for inbox
  // when comparing exact children — callers pass the specific href.
  return pathname.startsWith(`${href}/`);
}

function entryIsActive(pathname: string, entry: NavEntry): boolean {
  if (entry.kind === "link") {
    return pathMatches(pathname, entry.href) || pathname === entry.href;
  }
  return entry.children.some(
    (child) => pathname === child.href || pathMatches(pathname, child.href),
  );
}

function childIsActive(pathname: string, href: string, siblings: string[]): boolean {
  if (pathname === href) return true;
  // Prefer the most specific matching sibling so /notifications doesn't
  // stay active when viewing /notifications/preferences.
  const matches = siblings.filter(
    (candidate) =>
      pathname === candidate || pathname.startsWith(`${candidate}/`),
  );
  if (matches.length === 0) return false;
  const best = matches.reduce((a, b) => (a.length >= b.length ? a : b));
  return best === href;
}

export function AppSidebarNav({
  churches,
  activeOrganizationId,
  navSections,
  lockSummaries = {},
}: {
  churches: ChurchOption[];
  activeOrganizationId: string | null;
  role?: MembershipRole | null;
  navSections: NavSection[];
  lockSummaries?: Record<string, FeatureLockSummary>;
}) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [upgradeLock, setUpgradeLock] = useState<FeatureLockSummary | null>(
    null,
  );

  const activeGroupIds = useMemo(() => {
    const ids: string[] = [];
    for (const section of navSections) {
      for (const entry of section.items) {
        if (entry.kind === "group" && entryIsActive(pathname, entry)) {
          ids.push(entry.id);
        }
      }
    }
    return ids;
  }, [navSections, pathname]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") {
      setCollapsed(true);
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (activeGroupIds.length === 0) return;
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const id of activeGroupIds) {
        next[id] = true;
      }
      return next;
    });
  }, [activeGroupIds]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Desktop can be icon-only; the phone drawer always shows full labels.
  const desktopCompact = collapsed;

  const resolveLock = (item: {
    locked?: boolean;
    featureKey?: string;
  }): FeatureLockSummary | null => {
    if (!item.locked || !item.featureKey) return null;
    return lockSummaries[item.featureKey] ?? null;
  };

  const openUpgrade = (lock: FeatureLockSummary | null) => {
    if (!lock) return;
    setMobileOpen(false);
    setUpgradeLock(lock);
  };

  const renderLink = (
    item: NavLinkItem,
    options?: { nested?: boolean; active?: boolean },
  ) => {
    const Icon = NAV_ICONS[item.id];
    const nested = options?.nested ?? false;
    const isActive = options?.active ?? false;
    const lock = resolveLock(item);
    const descriptionId = lock ? `nav-lock-${item.id}` : undefined;

    const className = cn(
      "relative flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
      nested && "py-1.5 pl-9 text-[13px]",
      desktopCompact &&
        !nested &&
        "md:h-10 md:w-10 md:justify-center md:gap-0 md:px-0 md:py-0",
      desktopCompact && nested && "md:hidden",
      lock
        ? "cursor-not-allowed text-muted-foreground hover:bg-[hsl(var(--nav-hover))]"
        : isActive
          ? nested
            ? "bg-[hsl(var(--nav-hover))] text-foreground"
            : "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-[hsl(var(--nav-hover))] hover:text-accent-foreground",
    );

    const inner = (
      <>
        {Icon && !nested ? <Icon className="h-4 w-4 shrink-0" /> : null}
        {nested ? (
          <span
            className={cn(
              "mr-2 h-1.5 w-1.5 shrink-0 rounded-full",
              isActive && !lock ? "bg-primary" : "bg-border",
            )}
            aria-hidden
          />
        ) : null}
        <span className={cn("flex-1 text-left", desktopCompact && !nested && "md:hidden")}>
          {item.label}
        </span>
        {lock ? (
          <Lock
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              desktopCompact && !nested && "md:hidden",
            )}
            aria-hidden
          />
        ) : null}
        {lock && desktopCompact && !nested ? (
          <Lock className="hidden h-3 w-3 md:block" aria-hidden />
        ) : null}
        {lock ? (
          <span
            className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden w-64 -translate-y-1/2 rounded-md border border-border bg-popover p-2 text-xs font-normal text-popover-foreground shadow-md group-hover:block group-focus-within:block max-md:hidden"
            role="tooltip"
          >
            {lock.shortMessage} {lock.longMessage}
          </span>
        ) : null}
      </>
    );

    if (lock) {
      return (
        <button
          key={item.id}
          type="button"
          title={lock.shortMessage}
          aria-label={item.label}
          aria-disabled="true"
          aria-describedby={descriptionId}
          className={cn(className, "group w-full")}
          onClick={() => openUpgrade(lock)}
        >
          {inner}
          <span id={descriptionId} className="sr-only">
            {lock.longMessage}
          </span>
        </button>
      );
    }

    return (
      <Link
        key={item.id}
        href={item.href}
        title={item.label}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
        className={className}
      >
        {inner}
      </Link>
    );
  };

  const renderEntry = (entry: NavEntry) => {
    if (entry.kind === "link") {
      const active =
        pathname === entry.href || pathMatches(pathname, entry.href);
      const isActive =
        entry.href === "/notifications"
          ? pathname === "/notifications" ||
            (pathname.startsWith("/notifications/") &&
              !pathname.startsWith("/notifications/preferences") &&
              !pathname.startsWith("/notification-groups"))
          : active;
      return renderLink(entry, { active: isActive });
    }

    const Icon = NAV_ICONS[entry.id] ?? Settings2;
    const groupActive = entryIsActive(pathname, entry);
    const isOpen = openGroups[entry.id] ?? groupActive;
    const siblingHrefs = entry.children.map((child) => child.href);
    const groupLock = resolveLock(entry);
    const groupHasLockedChildren = entry.children.some((child) => child.locked);

    if (desktopCompact) {
      if (groupLock) {
        return (
          <button
            key={entry.id}
            type="button"
            title={groupLock.shortMessage}
            aria-label={entry.label}
            aria-disabled="true"
            aria-describedby={`nav-lock-${entry.id}`}
            onClick={() => openUpgrade(groupLock)}
            className="group relative flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground"
          >
            <Icon className="h-4 w-4" />
            <Lock className="absolute bottom-1 right-1 h-3 w-3" aria-hidden />
            <span id={`nav-lock-${entry.id}`} className="sr-only">
              {groupLock.longMessage}
            </span>
          </button>
        );
      }
      return (
        <Link
          key={entry.id}
          href={entry.href}
          title={entry.label}
          aria-label={entry.label}
          onClick={() => {
            setMobileOpen(false);
            setCollapsed(false);
            window.localStorage.setItem(STORAGE_KEY, "0");
            setOpenGroups((prev) => ({ ...prev, [entry.id]: true }));
          }}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
            groupActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-[hsl(var(--nav-hover))] hover:text-accent-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </Link>
      );
    }

    return (
      <div key={entry.id} className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            if (groupLock) {
              openUpgrade(groupLock);
              toggleGroup(entry.id);
              return;
            }
            toggleGroup(entry.id);
          }}
          aria-expanded={isOpen}
          aria-disabled={groupLock ? "true" : undefined}
          title={groupLock?.shortMessage}
          className={cn(
            "group relative flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            groupLock
              ? "cursor-not-allowed text-muted-foreground"
              : groupActive
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-[hsl(var(--nav-hover))] hover:text-accent-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{entry.label}</span>
          {groupLock || groupHasLockedChildren ? (
            <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : null}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 transition-transform",
              isOpen && "rotate-180",
            )}
          />
          {groupLock ? (
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden w-64 -translate-y-1/2 rounded-md border border-border bg-popover p-2 text-xs font-normal text-popover-foreground shadow-md group-hover:block group-focus-within:block max-md:hidden">
              {groupLock.shortMessage}
            </span>
          ) : null}
        </button>
        {isOpen ? (
          <div className="space-y-0.5">
            {entry.children.map((child) =>
              renderLink(child, {
                nested: true,
                active: childIsActive(pathname, child.href, siblingHrefs),
              }),
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <BrandLogo
          href="/dashboard"
          size={28}
          wordmarkClassName="text-base font-semibold tracking-tight"
        />
      </div>

      <div
        className={cn(
          "max-md:pointer-events-none max-md:h-0 max-md:w-0 max-md:overflow-visible",
          desktopCompact ? "md:w-[4.25rem]" : "md:w-64",
          "md:pointer-events-auto md:shrink-0",
        )}
      >
        {mobileOpen && (
          <button
            type="button"
            className="pointer-events-auto fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={cn(
            "pointer-events-auto flex h-full min-h-app flex-col border-r border-border bg-card pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] transition-[width,transform] duration-200 ease-out",
            "fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] md:static md:z-auto md:min-h-app md:w-full md:pt-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center border-b border-border",
              desktopCompact
                ? "justify-between px-3 md:justify-center md:px-2"
                : "justify-between gap-2 px-3",
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo
                href="/"
                size={28}
                showWordmark={!desktopCompact}
                className={cn(desktopCompact && "hidden md:inline-flex")}
                wordmarkClassName="text-base font-semibold tracking-tight"
              />
              {desktopCompact && (
                <BrandLogo
                  href="/"
                  size={28}
                  className="md:hidden"
                  wordmarkClassName="text-base font-semibold tracking-tight"
                />
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 md:hidden"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </Button>
              {!desktopCompact && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden h-11 w-11 shrink-0 md:inline-flex"
                  onClick={toggleCollapsed}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {desktopCompact && (
            <div className="hidden justify-center border-b border-border py-2 md:flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={toggleCollapsed}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {activeOrganizationId && churches.length > 0 && (
            <div
              className={cn(
                "border-b border-border p-3",
                desktopCompact && "md:flex md:justify-center md:p-2",
              )}
            >
              <ChurchSwitcher
                churches={churches}
                activeOrganizationId={activeOrganizationId}
                collapsed={desktopCompact}
              />
            </div>
          )}

          <nav
            className={cn(
              "flex flex-1 flex-col gap-4 overflow-y-auto p-3 md:p-4",
              desktopCompact && "md:items-center md:gap-2 md:p-2",
            )}
          >
            {navSections.map((section) => (
              <div
                key={section.id}
                className={cn(
                  "space-y-1",
                  desktopCompact && "md:flex md:flex-col md:items-center md:space-y-1",
                )}
              >
                {section.label && !desktopCompact ? (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </p>
                ) : null}
                {section.label && desktopCompact ? (
                  <div
                    className="my-1 hidden h-px w-6 bg-border md:block"
                    aria-hidden
                  />
                ) : null}
                {section.items.map((entry) => renderEntry(entry))}
              </div>
            ))}
          </nav>

          <div
            className={cn(
              "border-t border-border p-4",
              desktopCompact &&
                "md:flex md:flex-col md:items-center md:gap-2 md:p-2",
            )}
          >
            <p
              className={cn(
                "mb-3 truncate text-xs text-muted-foreground",
                desktopCompact && "md:hidden",
              )}
            >
              {userEmail}
            </p>
            <LogoutButton
              className={cn(
                "h-11 w-full",
                desktopCompact && "md:h-10 md:w-10",
              )}
              variant="outline"
              size={desktopCompact ? "icon" : "sm"}
              title={userEmail ? `Sign out (${userEmail})` : "Sign out"}
              aria-label="Sign out"
            >
              {desktopCompact ? (
                <>
                  <LogOut className="hidden h-4 w-4 md:block" />
                  <span className="md:hidden">Sign out</span>
                </>
              ) : (
                "Sign out"
              )}
            </LogoutButton>
          </div>
        </aside>
      </div>
      <UpgradeFeatureDialog
        lock={upgradeLock}
        open={Boolean(upgradeLock)}
        onClose={() => setUpgradeLock(null)}
      />
    </>
  );
}

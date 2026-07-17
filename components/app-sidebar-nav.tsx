"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Award,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  Church,
  CreditCard,
  Crown,
  Cross,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MailPlus,
  ArrowLeftRight,
  Menu,
  ScrollText,
  Shield,
  Users,
  AlertTriangle,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { ChurchSwitcher, type ChurchOption } from "@/components/church-switcher";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getNavItemsForRole,
  navLabelForRole,
  type NavItemId,
} from "@/lib/church/navigation";
import type { MembershipRole } from "@/lib/church/types";

const STORAGE_KEY = "sp-sidebar-collapsed";

const NAV_ICONS: Record<NavItemId, LucideIcon> = {
  dashboard: LayoutDashboard,
  incidents: AlertTriangle,
  "select-church": ArrowLeftRight,
  team: Users,
  certifications: Award,
  "security-hardware": HardDrive,
  "medical-supplies": Cross,
  campuses: Building2,
  "security-settings": Shield,
  "church-settings": Church,
  invitations: MailPlus,
  audit: ScrollText,
  ownership: Crown,
  billing: CreditCard,
  "account-status": Activity,
  profile: UserRound,
};

export function AppSidebarNav({
  churches,
  activeChurchId,
  role,
}: {
  churches: ChurchOption[];
  activeChurchId: string | null;
  role: MembershipRole | null;
}) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = getNavItemsForRole(role);

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

  // Desktop can be icon-only; the phone drawer always shows full labels.
  const desktopCompact = collapsed;

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
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

      {/* Zero footprint on phone so the drawer doesn't shove main content. */}
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
            "pointer-events-auto flex h-full min-h-screen flex-col border-r border-border bg-card transition-[width,transform] duration-200 ease-out",
            "fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] md:static md:z-auto md:min-h-screen md:w-full",
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

          {activeChurchId && churches.length > 0 && (
            <div
              className={cn(
                "border-b border-border p-3",
                desktopCompact && "md:flex md:justify-center md:p-2",
              )}
            >
              <ChurchSwitcher
                churches={churches}
                activeChurchId={activeChurchId}
                collapsed={desktopCompact}
              />
            </div>
          )}

          <nav
            className={cn(
              "flex flex-1 flex-col gap-1 overflow-y-auto p-3 md:p-4",
              desktopCompact && "md:items-center md:p-2",
            )}
          >
            {navItems.map((item) => {
              const Icon = NAV_ICONS[item.id];
              const label = role ? navLabelForRole(item, role) : item.label;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={label}
                  aria-label={label}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    desktopCompact &&
                      "md:h-10 md:w-10 md:justify-center md:gap-0 md:px-0 md:py-0",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn(desktopCompact && "md:hidden")}>
                    {label}
                  </span>
                </Link>
              );
            })}
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
    </>
  );
}

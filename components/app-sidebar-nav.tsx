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
  LayoutDashboard,
  LogOut,
  MailPlus,
  ArrowLeftRight,
  ScrollText,
  Shield,
  Users,
  AlertTriangle,
  UserRound,
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

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-[4.25rem]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-border",
          collapsed ? "justify-center px-2" : "justify-between gap-2 px-3",
        )}
      >
        {collapsed ? (
          <BrandLogo href="/" size={28} showWordmark={false} />
        ) : (
          <BrandLogo
            href="/"
            size={28}
            wordmarkClassName="text-base font-semibold tracking-tight"
          />
        )}
        {!collapsed && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center border-b border-border py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
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
            "border-b border-border",
            collapsed ? "flex justify-center p-2" : "p-3",
          )}
        >
          <ChurchSwitcher
            churches={churches}
            activeChurchId={activeChurchId}
            collapsed={collapsed}
          />
        </div>
      )}

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 overflow-y-auto",
          collapsed ? "items-center p-2" : "p-4",
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
              className={cn(
                "flex items-center rounded-md text-sm font-medium transition-colors",
                collapsed
                  ? "h-10 w-10 justify-center"
                  : "gap-3 px-3 py-2",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-border",
          collapsed ? "flex flex-col items-center gap-2 p-2" : "p-4",
        )}
      >
        {!collapsed && userEmail && (
          <p className="mb-3 truncate text-xs text-muted-foreground">
            {userEmail}
          </p>
        )}
        {collapsed ? (
          <LogoutButton
            className="h-10 w-10"
            variant="outline"
            size="icon"
            title={userEmail ? `Sign out (${userEmail})` : "Sign out"}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </LogoutButton>
        ) : (
          <LogoutButton className="w-full" variant="outline" size="sm" />
        )}
      </div>
    </aside>
  );
}

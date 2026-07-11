"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Camera,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  Radio,
  Users,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "sp-sidebar-collapsed";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/events", label: "Events", icon: Bell },
  { href: "/certifications", label: "Certifications", icon: Award },
  { href: "/team", label: "Team Members", icon: Users },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/sensors", label: "Sensors", icon: Radio },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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

      <nav
        className={cn(
          "flex flex-1 flex-col gap-1",
          collapsed ? "items-center p-2" : "p-4",
        )}
      >
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
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

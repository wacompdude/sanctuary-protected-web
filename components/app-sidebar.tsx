"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Camera,
  LayoutDashboard,
  Radio,
  Shield,
  Users,
  AlertTriangle,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { createClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <Shield className="h-6 w-6 text-foreground" />
        <span className="text-lg font-semibold tracking-tight">
          Sanctuary Protected
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        {userEmail && (
          <p className="mb-3 truncate text-xs text-muted-foreground">
            {userEmail}
          </p>
        )}
        <LogoutButton className="w-full" variant="outline" size="sm" />
      </div>
    </aside>
  );
}

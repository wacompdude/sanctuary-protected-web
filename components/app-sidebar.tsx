"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/certifications", label: "Certifications", icon: Award },
  { href: "/team", label: "Team Members", icon: Users },
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/sensors", label: "Sensors", icon: Radio },
];

export function AppSidebar() {
  const pathname = usePathname();

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
    </aside>
  );
}

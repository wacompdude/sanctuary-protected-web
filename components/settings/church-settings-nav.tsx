"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CHURCH_SETTINGS_SECTIONS } from "@/lib/church/settings-nav";

export function ChurchSettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Church settings categories"
      className="flex gap-1 overflow-x-auto border-b border-border pb-px md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pr-4 md:pb-0"
    >
      {CHURCH_SETTINGS_SECTIONS.map((section) => {
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.id}
            href={section.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

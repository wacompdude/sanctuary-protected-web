"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type CampusTabId =
  | "overview"
  | "members"
  | "teams"
  | "roles"
  | "delegated"
  | "settings"
  | "audit";

export function CampusTabNav({
  campusId,
  active,
  tabs,
}: {
  campusId: string;
  active: CampusTabId;
  tabs: Array<{ id: CampusTabId; label: string }>;
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 rounded-md bg-muted p-1 text-muted-foreground"
      aria-label="Campus sections"
    >
      {tabs.map((tab) => {
        const href =
          tab.id === "overview"
            ? `/campuses/${campusId}`
            : `/campuses/${campusId}?tab=${tab.id}`;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              "inline-flex items-center rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

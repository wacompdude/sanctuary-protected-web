"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CHURCH_SETTINGS_SECTIONS } from "@/lib/church/settings-nav";
import { CHURCH_CONTACT_GROUPS } from "@/lib/church/contacts";

export function ChurchSettingsNav() {
  const pathname = usePathname();
  const contactActive = pathname.startsWith("/settings/church/contact");

  return (
    <nav
      aria-label="Church settings categories"
      className="flex gap-1 overflow-x-auto border-b border-border pb-px md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pr-4 md:pb-0"
    >
      {CHURCH_SETTINGS_SECTIONS.map((section) => {
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        const isContact = section.id === "contact";

        return (
          <div key={section.id} className="shrink-0 md:w-full">
            <Link
              href={isContact ? "/settings/church/contact/organization" : section.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {section.label}
            </Link>

            {isContact && contactActive ? (
              <div className="mt-1 ml-2 hidden space-y-0.5 border-l border-border pl-2 md:block">
                {CHURCH_CONTACT_GROUPS.map((group) => {
                  const groupActive =
                    pathname === group.href ||
                    pathname.startsWith(`${group.href}/`);
                  return (
                    <Link
                      key={group.id}
                      href={group.href}
                      className={cn(
                        "block rounded-md px-2 py-1.5 text-xs transition-colors",
                        groupActive
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {group.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      {contactActive ? (
        <div className="flex gap-1 md:hidden">
          {CHURCH_CONTACT_GROUPS.map((group) => {
            const groupActive =
              pathname === group.href || pathname.startsWith(`${group.href}/`);
            return (
              <Link
                key={group.id}
                href={group.href}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                  groupActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground",
                )}
              >
                {group.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}

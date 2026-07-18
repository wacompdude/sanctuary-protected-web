"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHURCH_SETTINGS_SECTIONS } from "@/lib/church/settings-nav";
import { CHURCH_CONTACT_GROUPS } from "@/lib/church/contacts";
import {
  brandedSubnavItemClass,
  brandedSubnavShellClassName,
} from "@/lib/ui/branded-subnav";

export function ChurchSettingsNav() {
  const pathname = usePathname();
  const contactActive = pathname.startsWith("/settings/church/contact");

  return (
    <nav
      aria-label="Church settings categories"
      className={brandedSubnavShellClassName()}
    >
      {CHURCH_SETTINGS_SECTIONS.map((section) => {
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        const isContact = section.id === "contact";

        return (
          <div key={section.id} className="shrink-0 md:w-full">
            <Link
              href={
                isContact
                  ? "/settings/church/contact/organization"
                  : section.href
              }
              className={brandedSubnavItemClass(active)}
            >
              {section.label}
            </Link>

            {isContact && contactActive ? (
              <div className="mt-1 ml-2 hidden space-y-0.5 border-l border-primary/30 pl-2 md:block">
                {CHURCH_CONTACT_GROUPS.map((group) => {
                  const groupActive =
                    pathname === group.href ||
                    pathname.startsWith(`${group.href}/`);
                  return (
                    <Link
                      key={group.id}
                      href={group.href}
                      className={brandedSubnavItemClass(groupActive, {
                        nested: true,
                      })}
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
                className={brandedSubnavItemClass(groupActive, { pill: true })}
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

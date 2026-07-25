import Link from "next/link";
import { filterPlatformNavSections } from "@/lib/platform/navigation";

export function PlatformConsoleNav({
  permissions,
  pathname,
}: {
  permissions: ReadonlySet<string>;
  pathname: string;
}) {
  const sections = filterPlatformNavSections(permissions);

  return (
    <nav className="space-y-6 text-sm">
      {sections.map((section) => (
        <div key={section.id}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {section.label}
          </p>
          <ul className="space-y-1">
            {section.links.map((link) => {
              const active =
                link.href === "/platform"
                  ? pathname === "/platform"
                  : pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={
                      active
                        ? "block rounded-md bg-slate-800 px-3 py-2 text-amber-300"
                        : "block rounded-md px-3 py-2 text-slate-300 hover:bg-slate-900 hover:text-white"
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

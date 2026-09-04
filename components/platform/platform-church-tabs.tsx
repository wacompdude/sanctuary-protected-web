import Link from "next/link";

const TABS = [
  { id: "overview", href: (id: string) => `/platform/churches/${id}`, label: "Overview" },
  {
    id: "subscription",
    href: (id: string) => `/platform/churches/${id}/subscription`,
    label: "Subscription",
  },
  { id: "members", href: (id: string) => `/platform/churches/${id}/members`, label: "Members" },
  { id: "campuses", href: (id: string) => `/platform/churches/${id}/campuses`, label: "Campuses" },
  { id: "security", href: (id: string) => `/platform/churches/${id}/security`, label: "Security" },
] as const;

export function PlatformChurchTabs({
  churchId,
  active,
  showSecurity = false,
}: {
  churchId: string;
  active: (typeof TABS)[number]["id"];
  showSecurity?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {TABS.filter((tab) => tab.id !== "security" || showSecurity).map((tab) => {
        const href = tab.href(churchId);
        if (tab.id === active) {
          return (
            <span
              key={tab.id}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-amber-300"
            >
              {tab.label}
            </span>
          );
        }
        return (
          <Link
            key={tab.id}
            href={href}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-300 hover:bg-slate-900"
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

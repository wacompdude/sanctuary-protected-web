import Link from "next/link";
import { LEGAL_NAV_ITEMS } from "@/lib/legal/config";
import { cn } from "@/lib/utils";

export function LegalLinks({
  className,
  variant = "full",
  currentPath,
}: {
  className?: string;
  variant?: "full" | "short";
  currentPath?: string;
}) {
  return (
    <nav
      aria-label="Legal documents"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
    >
      {LEGAL_NAV_ITEMS.map((item, index) => {
        const label = variant === "short" ? item.shortLabel : item.label;
        const current = currentPath === item.href;
        return (
          <span key={item.href} className="inline-flex items-center gap-x-3">
            {index > 0 ? (
              <span className="text-muted-foreground" aria-hidden>
                |
              </span>
            ) : null}
            <Link
              href={item.href}
              className={cn(
                "underline-offset-4 hover:underline",
                current && "font-medium text-foreground",
              )}
              aria-current={current ? "page" : undefined}
            >
              {label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

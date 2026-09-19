import Link from "next/link";
import { LegalLinks } from "@/components/legal/legal-links";
import {
  OPERATOR_DISPLAY_NAME,
  brandIdentityLine,
  copyrightYear,
} from "@/lib/legal/config";
import { cn } from "@/lib/utils";

/**
 * Site-wide footer: Privacy / Terms / Billing + business identity.
 * Use on public and authenticated shells so the same legal chrome appears everywhere.
 */
export function SiteFooter({
  className,
  currentPath,
  tone = "default",
  showHomeLink = false,
  homeHref = "/",
}: {
  className?: string;
  currentPath?: string;
  /** `inverse` for dark platform shells. */
  tone?: "default" | "inverse" | "landing";
  showHomeLink?: boolean;
  homeHref?: string;
}) {
  const muted =
    tone === "inverse"
      ? "text-slate-400"
      : tone === "landing"
        ? "text-[var(--lp-muted)]"
        : "text-muted-foreground";
  const border =
    tone === "inverse"
      ? "border-slate-800"
      : tone === "landing"
        ? "border-[var(--lp-mist)]"
        : "border-border";
  const linkHover =
    tone === "inverse" ? "hover:text-slate-200" : "hover:underline";

  return (
    <footer
      className={cn(
        "border-t px-4 py-8 text-sm sm:px-6",
        border,
        muted,
        className,
      )}
      data-testid="site-footer"
      data-print-hide
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p>{brandIdentityLine()}</p>
          <p>
            © {copyrightYear()} {OPERATOR_DISPLAY_NAME}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <LegalLinks
            variant="short"
            currentPath={currentPath}
            className={cn(muted, linkHover)}
          />
          {showHomeLink ? (
            <Link
              href={homeHref}
              className={cn("underline-offset-4", linkHover)}
            >
              Home
            </Link>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

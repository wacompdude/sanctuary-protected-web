import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { OPERATOR_DISPLAY_NAME, copyrightYear } from "@/lib/legal/config";

export function LegalPublicFooter({
  showLogo = false,
  currentPath,
  homeHref = "/",
}: {
  showLogo?: boolean;
  currentPath?: string;
  homeHref?: string;
}) {
  return (
    <footer
      className="border-t border-border px-4 py-8 text-sm text-muted-foreground sm:px-6"
      data-print-hide
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showLogo ? (
          <BrandLogo
            href="/"
            size={28}
            wordmarkClassName="text-base font-normal"
          />
        ) : (
          <p>
            © {copyrightYear()} {OPERATOR_DISPLAY_NAME}
          </p>
        )}
        <LegalLinks variant="short" currentPath={currentPath} />
        <Link href={homeHref} className="underline-offset-4 hover:underline">
          Home
        </Link>
        {showLogo ? (
          <p>
            © {copyrightYear()} {OPERATOR_DISPLAY_NAME}
          </p>
        ) : null}
      </div>
    </footer>
  );
}

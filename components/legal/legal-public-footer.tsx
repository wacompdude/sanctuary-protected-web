import { SiteFooter } from "@/components/site-footer";

/** @deprecated Prefer SiteFooter — kept as a thin alias for legal pages. */
export function LegalPublicFooter({
  currentPath,
  homeHref = "/",
}: {
  showLogo?: boolean;
  currentPath?: string;
  homeHref?: string;
}) {
  return (
    <SiteFooter
      currentPath={currentPath}
      showHomeLink
      homeHref={homeHref}
    />
  );
}

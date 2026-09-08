import { BrandLogo } from "@/components/brand-logo";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { LegalLinks } from "@/components/legal/legal-links";
import { LegalPublicFooter } from "@/components/legal/legal-public-footer";
import { LegalTableOfContents } from "@/components/legal/legal-toc";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PRODUCT_NAME, formatPolicyDate } from "@/lib/legal/config";
import type { LegalDocument } from "@/lib/legal/types";

export function LegalPageLayout({
  document,
}: {
  document: LegalDocument;
}) {
  const path = `/${document.slug}`;

  return (
    <div className="min-h-app bg-background text-foreground">
      <header
        className="border-b border-border"
        data-print-hide
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandLogo
            href="/"
            size={28}
            wordmarkClassName="text-base font-semibold tracking-tight"
          />
          <ThemeSwitcher />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-medium text-muted-foreground">Legal</p>
        <div data-print-hide className="mt-2">
          <LegalLinks currentPath={path} />
        </div>

        <div className="mt-8 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
          <LegalTableOfContents document={document} />
          <main>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {document.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {PRODUCT_NAME}
            </p>
            <dl className="mt-4 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="inline font-medium text-foreground">Effective: </dt>
                <dd className="inline">{formatPolicyDate(document.effectiveDate)}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Last updated: </dt>
                <dd className="inline">{formatPolicyDate(document.lastUpdated)}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Version: </dt>
                <dd className="inline">{document.version}</dd>
              </div>
            </dl>
            <div className="mt-8">
              <LegalDocumentView document={document} />
            </div>
          </main>
        </div>
      </div>

      <LegalPublicFooter currentPath={path} />
    </div>
  );
}

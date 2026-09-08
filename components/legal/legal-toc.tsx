"use client";

import type { LegalDocument } from "@/lib/legal/types";
import { cn } from "@/lib/utils";

export function LegalTableOfContents({
  document,
  className,
}: {
  document: LegalDocument;
  className?: string;
}) {
  const links = (
    <ol className="space-y-1.5 text-sm">
      {document.sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <details
        className={cn("rounded-md border border-border bg-card p-3 lg:hidden", className)}
        data-print-hide
      >
        <summary className="cursor-pointer text-sm font-medium">Contents</summary>
        <div className="mt-3">{links}</div>
      </details>
      <aside
        className="sticky top-6 hidden max-h-[calc(100dvh-4rem)] overflow-y-auto lg:block"
        aria-label="Table of contents"
        data-print-hide
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contents
        </p>
        <div className="mt-3">{links}</div>
      </aside>
    </>
  );
}

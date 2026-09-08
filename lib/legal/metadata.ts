import type { Metadata } from "next";
import type { LegalDocument } from "@/lib/legal/types";

export function legalDocumentMetadata(document: LegalDocument): Metadata {
  return {
    title: { absolute: document.metaTitle },
    description: document.metaDescription,
    robots: { index: true, follow: true },
    alternates: { canonical: `/${document.slug}` },
  };
}

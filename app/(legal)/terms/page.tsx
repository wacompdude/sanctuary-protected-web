import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { TERMS_DOCUMENT } from "@/lib/legal/documents/terms";
import { legalDocumentMetadata } from "@/lib/legal/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = legalDocumentMetadata(TERMS_DOCUMENT);

export default function TermsPage() {
  return <LegalPageLayout document={TERMS_DOCUMENT} />;
}

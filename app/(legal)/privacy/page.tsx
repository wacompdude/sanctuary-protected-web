import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { PRIVACY_DOCUMENT } from "@/lib/legal/documents/privacy";
import { legalDocumentMetadata } from "@/lib/legal/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = legalDocumentMetadata(PRIVACY_DOCUMENT);

export default function PrivacyPage() {
  return <LegalPageLayout document={PRIVACY_DOCUMENT} />;
}

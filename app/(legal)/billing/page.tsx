import { LegalPageLayout } from "@/components/legal/legal-page-layout";
import { BILLING_DOCUMENT } from "@/lib/legal/documents/billing";
import { legalDocumentMetadata } from "@/lib/legal/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = legalDocumentMetadata(BILLING_DOCUMENT);

export default function BillingPolicyPage() {
  return <LegalPageLayout document={BILLING_DOCUMENT} />;
}

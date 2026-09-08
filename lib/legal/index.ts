export {
  BILLING_CONTACT_EMAIL,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY_NAME,
  LEGAL_NAV_ITEMS,
  LEGAL_ROUTES,
  OPERATOR_DISPLAY_NAME,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRIVACY_CONTACT_EMAIL,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  copyrightYear,
  formatPolicyDate,
  operatorLabel,
} from "@/lib/legal/config";
export { BILLING_DOCUMENT } from "@/lib/legal/documents/billing";
export { PRIVACY_DOCUMENT } from "@/lib/legal/documents/privacy";
export { TERMS_DOCUMENT } from "@/lib/legal/documents/terms";
export type { LegalDocument, LegalSection } from "@/lib/legal/types";

import { BILLING_DOCUMENT } from "@/lib/legal/documents/billing";
import { PRIVACY_DOCUMENT } from "@/lib/legal/documents/privacy";
import { TERMS_DOCUMENT } from "@/lib/legal/documents/terms";
import type { LegalDocument } from "@/lib/legal/types";

export function getLegalDocument(
  slug: LegalDocument["slug"],
): LegalDocument {
  switch (slug) {
    case "terms":
      return TERMS_DOCUMENT;
    case "privacy":
      return PRIVACY_DOCUMENT;
    case "billing":
      return BILLING_DOCUMENT;
  }
}

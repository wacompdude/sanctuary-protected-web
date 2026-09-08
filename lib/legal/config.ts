/**
 * Central legal/product identity for public policy pages.
 *
 * Update versions and dates here — not in page components.
 *
 * LEGAL_ENTITY_NAME is null because the repository does not publish a
 * registered company name. Do not substitute "Unified Protective Technologies, LLC"
 * unless counsel confirms that entity operates the production service.
 *
 * @legal-review governing law, mailing address, dedicated legal/privacy mailboxes
 */
export const PRODUCT_NAME = "Sanctuary Protected";

export const LEGAL_ENTITY_NAME: string | null = null;

export const OPERATOR_DISPLAY_NAME = LEGAL_ENTITY_NAME ?? PRODUCT_NAME;

export const SUPPORT_EMAIL = "support@sanctuaryprotected.com";
export const LEGAL_CONTACT_EMAIL = SUPPORT_EMAIL;
export const PRIVACY_CONTACT_EMAIL = SUPPORT_EMAIL;
export const BILLING_CONTACT_EMAIL = "billing@sanctuaryprotected.com";

export const MAILING_ADDRESS: string | null = null;

export const GOVERNING_STATE: string | null = null;

export const PUBLIC_SITE_HOST = "sanctuaryprotected.com";

export const LEGAL_ROUTES = {
  terms: "/terms",
  privacy: "/privacy",
  billing: "/billing",
} as const;

export const LEGAL_NAV_ITEMS = [
  { href: LEGAL_ROUTES.terms, label: "Terms of Service", shortLabel: "Terms" },
  { href: LEGAL_ROUTES.privacy, label: "Privacy Policy", shortLabel: "Privacy" },
  { href: LEGAL_ROUTES.billing, label: "Billing & Subscription Policy", shortLabel: "Billing" },
] as const;

export const POLICY_VERSIONS = {
  terms: "1.0.0",
  privacy: "1.0.0",
  billing: "1.0.0",
} as const;

/** ISO calendar dates (UTC). */
export const POLICY_DATES = {
  termsEffective: "2026-09-07",
  termsUpdated: "2026-09-07",
  privacyEffective: "2026-09-07",
  privacyUpdated: "2026-09-07",
  billingEffective: "2026-09-07",
  billingUpdated: "2026-09-07",
} as const;

export type PolicyDocumentKey = keyof typeof POLICY_VERSIONS;

export function formatPolicyDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export const COPYRIGHT_YEAR = Number.parseInt(
  POLICY_DATES.termsUpdated.slice(0, 4),
  10,
);

export function copyrightYear(): number {
  return COPYRIGHT_YEAR;
}

export function operatorLabel(): string {
  if (LEGAL_ENTITY_NAME) {
    return `${LEGAL_ENTITY_NAME}, doing business as ${PRODUCT_NAME}`;
  }
  return `the operator of ${PRODUCT_NAME}`;
}

export function mailingAddressDisplay(): string {
  return (
    MAILING_ADDRESS ??
    "A physical mailing address has not been published in this version. Use the email contacts listed in these policies."
  );
}

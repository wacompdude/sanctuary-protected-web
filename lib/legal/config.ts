/**
 * Central legal/product identity for public policy pages.
 *
 * Use PRODUCT_NAME ("Sanctuary Protected LLC") for SMS program branding,
 * consent, Privacy, Terms, Billing, and other legal copy.
 *
 * Update versions and dates here — not in page components.
 *
 * @legal-review governing law, mailing address, dedicated legal/privacy mailboxes
 */

/** Customer-facing product and legal business name. */
export const PRODUCT_NAME = "Sanctuary Protected LLC";

/** SMS program brand — same as the legal business name. */
export const SMS_BRAND_NAME = PRODUCT_NAME;

/** Business name used in footers, copyright, and legal identity lines. */
export const BUSINESS_NAME = PRODUCT_NAME;

/** Parent company. Sanctuary Protected LLC is a service of this entity. */
export const LEGAL_ENTITY_NAME = "Unified Protective Technologies LLC";

export const OPERATOR_DISPLAY_NAME = BUSINESS_NAME;

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
  { href: LEGAL_ROUTES.privacy, label: "Privacy Policy", shortLabel: "Privacy" },
  { href: LEGAL_ROUTES.terms, label: "Terms of Service", shortLabel: "Terms" },
  { href: LEGAL_ROUTES.billing, label: "Billing & Subscription Policy", shortLabel: "Billing" },
] as const;

export const POLICY_VERSIONS = {
  terms: "1.3.0",
  privacy: "1.2.0",
  billing: "1.0.0",
} as const;

/** ISO calendar dates (UTC). */
export const POLICY_DATES = {
  termsEffective: "2026-09-07",
  termsUpdated: "2026-09-19",
  privacyEffective: "2026-09-07",
  privacyUpdated: "2026-09-19",
  billingEffective: "2026-09-07",
  billingUpdated: "2026-09-08",
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

/** Customer-facing business ↔ parent legal entity relationship. */
export function brandIdentityLine(): string {
  return `${BUSINESS_NAME} is a service of ${LEGAL_ENTITY_NAME}.`;
}

export function operatorLabel(): string {
  return `${BUSINESS_NAME}, a service of ${LEGAL_ENTITY_NAME}`;
}

export function mailingAddressDisplay(): string {
  return (
    MAILING_ADDRESS ??
    "A physical mailing address has not been published in this version. Use the email contacts listed in these policies."
  );
}

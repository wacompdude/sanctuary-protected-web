/**
 * Public legal framework self-check (no database required).
 * Run: npx --yes tsx lib/legal/foundation.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAuthEntryPath,
  isLegalPublicPath,
  isProtectedPath,
  isPublicPath,
  LEGAL_PUBLIC_PATHS,
} from "@/lib/auth/routes";
import {
  BUSINESS_NAME,
  BUSINESS_ORIGIN_STATE,
  GOVERNING_STATE,
  LEGAL_ENTITY_NAME,
  LEGAL_NAV_ITEMS,
  LEGAL_ROUTES,
  MAILING_ADDRESS,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRODUCT_NAME,
  SMS_BRAND_NAME,
  brandIdentityLine,
  copyrightYear,
  formatPolicyDate,
  mailingAddressDisplay,
} from "@/lib/legal/config";
import { BILLING_DOCUMENT } from "@/lib/legal/documents/billing";
import { PRIVACY_DOCUMENT } from "@/lib/legal/documents/privacy";
import { TERMS_DOCUMENT } from "@/lib/legal/documents/terms";
import { getLegalDocument } from "@/lib/legal";
import { flattenAttorneyReviewNotes, flattenLegalDocument } from "@/lib/legal/text";
import { PLAN_DISPLAY_NAMES } from "@/lib/subscriptions/plan-keys";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function main() {
  assert(PRODUCT_NAME === "Sanctuary Protected LLC", "product name");
  assert(BUSINESS_NAME === "Sanctuary Protected LLC", "business name");
  assert(SMS_BRAND_NAME === "Sanctuary Protected LLC", "SMS brand name");
  assert(
    LEGAL_ENTITY_NAME === "Unified Protective Technologies LLC",
    "legal entity name",
  );
  assert(
    brandIdentityLine() ===
      "Sanctuary Protected LLC is a service of Unified Protective Technologies LLC.",
    "brand identity line",
  );
  assert(formatPolicyDate("2026-09-07") === "September 7, 2026", "policy date format");
  assert(copyrightYear() === 2026, "copyright year comes from policy dates");
  assert(
    LEGAL_NAV_ITEMS.map((item) => item.shortLabel).join(",") ===
      "Privacy,Terms,Billing",
    "footer legal link order",
  );

  for (const path of LEGAL_PUBLIC_PATHS) {
    assert(isLegalPublicPath(path), `${path} is a legal public path`);
    assert(isPublicPath(path), `${path} is public`);
    assert(!isProtectedPath(path), `${path} is not a protected app route`);
    assert(!isAuthEntryPath(path), `${path} is not an auth-entry redirect`);
  }

  assert(isProtectedPath("/settings/billing"), "in-app billing remains protected");
  assert(isProtectedPath("/home"), "home remains protected");
  assert(!isPublicPath("/settings/billing"), "settings billing is not public");
  assert(LEGAL_ROUTES.terms === "/terms", "terms route");
  assert(LEGAL_NAV_ITEMS.length === 3, "three legal nav items");
  assert(isLegalPublicPath("/sms"), "/sms is a public opt-in evidence page");
  assert(isPublicPath("/sms"), "/sms is public");
  assert(!isProtectedPath("/sms"), "/sms is not a protected app route");

  const terms = getLegalDocument("terms");
  const privacy = getLegalDocument("privacy");
  const billing = getLegalDocument("billing");
  assert(terms === TERMS_DOCUMENT, "terms document identity");
  assert(privacy === PRIVACY_DOCUMENT, "privacy document identity");
  assert(billing === BILLING_DOCUMENT, "billing document identity");

  assert(terms.sections.length === 30, "terms has 30 sections");
  assert(privacy.sections.length === 25, "privacy has 25 sections");
  assert(billing.sections.length === 20, "billing has 20 sections");
  assert(terms.version === POLICY_VERSIONS.terms, "terms version centralized");
  assert(privacy.version === POLICY_VERSIONS.privacy, "privacy version centralized");
  assert(billing.version === POLICY_VERSIONS.billing, "billing version centralized");
  assert(terms.effectiveDate === POLICY_DATES.termsEffective, "terms effective date centralized");
  assert(privacy.effectiveDate === POLICY_DATES.privacyEffective, "privacy effective date");
  assert(billing.effectiveDate === POLICY_DATES.billingEffective, "billing effective date");

  const termsText = flattenLegalDocument(terms);
  const privacyText = flattenLegalDocument(privacy);
  const billingText = flattenLegalDocument(billing);
  const publicText = `${termsText}\n${privacyText}\n${billingText}`;

  assert(termsText.includes("not 911"), "terms states the service is not 911");
  assert(termsText.includes("does not guarantee prevention of crime"), "no safety guarantee");
  assert(termsText.includes("known safety-concern"), "safety concerns addressed");
  assert(termsText.toLowerCase().includes("trusted"), "trusted devices in terms");
  assert(privacyText.includes("trusted-device"), "privacy covers trusted devices");
  assert(privacyText.includes("HIPAA compliant") && privacyText.includes("do not claim"), "no HIPAA claim");
  assert(!/GDPR-compliant|CCPA compliant/i.test(publicText), "no invented GDPR/CCPA compliance");
  assert(!/completely secure|guarantee your information will never/i.test(publicText), "no absolute security claims");
  assert(!/Ring Protect|Neighbors App|TP-Link|Kasa Smart|Church Alert/i.test(publicText), "no copied reference brands");

  for (const name of Object.values(PLAN_DISPLAY_NAMES)) {
    assert(termsText.includes(name), `terms names plan ${name}`);
    assert(billingText.includes(name), `billing names plan ${name}`);
  }

  // Phase 5C-3E-1 / 5C-3E-2 pre-live policy lock (approved owner decisions).
  assert(
    MAILING_ADDRESS ===
      "522 W Riverside Ave Ste N\nSpokane, WA 99201-0581\nUnited States",
    "approved public mailing address (D-10)",
  );
  assert(
    mailingAddressDisplay().includes("522 W Riverside Ave Ste N") &&
      mailingAddressDisplay().includes("Spokane, WA 99201-0581"),
    "mailing address display uses approved address",
  );
  assert(GOVERNING_STATE === "Washington", "governing state is Washington (D-11)");
  assert(BUSINESS_ORIGIN_STATE === "Washington", "business origin documented");
  assert(
    !billingText.includes("[BUSINESS/LEGAL DECISION REQUIRED — REFUND POLICY]") &&
      !billingText.includes("[BUSINESS DECISION REQUIRED — SMS OVERAGES]"),
    "resolved refund and SMS overage placeholders removed",
  );
  assert(
    billingText.includes("7-day trial") &&
      billingText.includes("without providing a credit or debit card") &&
      billingText.includes("does not automatically convert") &&
      billingText.includes("does not automatically charge"),
    "trial policy matches D-01",
  );
  assert(
    billingText.includes("Except where required by applicable law") &&
      billingText.includes("generally non-refundable once billed") &&
      billingText.includes("duplicate charges") &&
      billingText.includes("no cash redemption value"),
    "refund policy matches D-02–D-05",
  );
  assert(
    billingText.includes("past due") &&
      billingText.includes("payment-recovery settings") &&
      billingText.includes("terminal unpaid or canceled"),
    "dunning policy matches D-06",
  );
  assert(
    billingText.includes("billing or service location") &&
      billingText.includes("jurisdictions in which we are required to collect tax") &&
      billingText.includes("do not claim to collect tax in every jurisdiction"),
    "tax policy matches D-07/D-09 without claiming universal collection",
  );
  assert(POLICY_VERSIONS.terms === "1.4.0", "terms version locked at 1.4.0");
  assert(POLICY_VERSIONS.billing === "1.1.1", "billing policy version locked at 1.1.1");
  assert(
    billingText.includes("500 on Shepherd Plus") &&
      billingText.includes("1,000 on Omni Enterprise") &&
      !billingText.includes("1,000 on Shepherd Plus"),
    "billing policy Shepherd SMS matches commercial catalog (500), not Omni (1,000)",
  );
  assert(
    billingText.includes("do not use open-ended, per-message metered SMS overage") &&
      billingText.includes("defined credit packages"),
    "SMS package-only model matches D-12",
  );
  assert(
    billingText.includes("monthly plan pricing only") &&
      billingText.includes("Annual billing is not offered"),
    "monthly-only launch matches D-13",
  );
  assert(
    billingText.includes("do not currently offer a third-party customer billing portal"),
    "Customer Portal remains disabled in policy (D-14)",
  );
  assert(
    billingText.includes("prorated amount due today") &&
      billingText.includes("scheduled for the next renewal"),
    "billing policy upgrade/downgrade wording matches Stripe always_invoice / period-end schedule",
  );
  assert(
    termsText.includes("laws of the State of Washington") &&
      termsText.includes("without regard to its conflict-of-laws principles") &&
      termsText.includes("do not designate an exclusive county or court venue"),
    "Terms governing law is Washington without exclusive venue (D-11)",
  );
  assert(
    !termsText.includes("have not been designated") &&
      !termsText.toLowerCase().includes("to be determined") &&
      !publicText.includes("GOVERNING_STATE") &&
      !billingText.includes("null"),
    "no unresolved governing-state placeholders in public copy",
  );
  assert(
    !termsText.includes("Spokane County") &&
      !termsText.includes("King County") &&
      !termsText.includes("Snohomish County"),
    "Terms do not invent an exclusive county venue",
  );

  const taxReadiness = readRepo("docs/billing/TAX_READINESS.md");
  assert(taxReadiness.includes("txcd_10103001"), "tax readiness documents candidate tax code");
  assert(
    taxReadiness.includes("BUSINESS TAX POLICY APPROVED") &&
      taxReadiness.includes("ONGOING TAX/NEXUS COMPLIANCE REQUIRED"),
    "D-09 status distinguishes approved policy from ongoing compliance",
  );
  assert(
    taxReadiness.includes("must **not** automatically be charged") ||
      taxReadiness.includes("must not automatically be charged"),
    "out-of-state customers not auto-charged WA tax solely for seller location",
  );
  assert(
    taxReadiness.includes("Do **not** hard-code a universal national economic-nexus") ||
      taxReadiness.includes("Do not hard-code a universal national economic-nexus"),
    "tax readiness forbids encoding a universal nexus threshold",
  );
  assert(
    !readRepo("lib/billing/stripe/sms-purchase-tax.ts").includes("economic nexus") &&
      !readRepo("lib/billing/stripe/subscription-tax.ts").includes("economic nexus"),
    "tax modules do not encode economic-nexus decision logic",
  );
  assert(taxReadiness.includes("Washington"), "tax readiness notes Washington origin");
  assert(
    taxReadiness.includes("Stripe Tax monitoring/capability") &&
      taxReadiness.includes("registration/collection authorization"),
    "Phase 3F principle: Tax capability ≠ registration",
  );

  const disputeRunbook = readRepo("docs/billing/DISPUTE_RUNBOOK.md");
  assert(
    disputeRunbook.includes("must **not** automatically") ||
      disputeRunbook.includes("must not automatically"),
    "dispute runbook forbids automatic revoke/delete",
  );
  assert(disputeRunbook.includes("Dashboard"), "dispute runbook uses Dashboard");

  const portalSource = readRepo("lib/billing/stripe/provider.ts");
  assert(
    portalSource.includes("customerPortal: false"),
    "Stripe Customer Portal remains unimplemented (D-14)",
  );

  const checkoutSource = readRepo("lib/billing/stripe/checkout.ts");
  assert(
    !checkoutSource.includes("trial_period_days"),
    "Checkout does not set Stripe trial_period_days (local trial only)",
  );
  assert(
    !checkoutSource.includes('"year"') && !checkoutSource.includes("'year'"),
    "subscription Checkout remains monthly-only",
  );

  const forbiddenPublicFlags = [
    "[ATTORNEY REVIEW REQUIRED]",
    "[PRIVACY COUNSEL REVIEW REQUIRED]",
    "[LEGAL REVIEW REQUIRED]",
    "[LEGAL REVIEW REQUIRED — SMS CONSENT]",
    "[LEGAL REVIEW REQUIRED — GOVERNING LAW]",
  ];
  for (const flag of forbiddenPublicFlags) {
    assert(!publicText.includes(flag), `public policies must not show ${flag}`);
  }

  const attorneyNotes = [
    ...flattenAttorneyReviewNotes(terms),
    ...flattenAttorneyReviewNotes(privacy),
    ...flattenAttorneyReviewNotes(billing),
  ];
  assert(termsText.includes("Reply STOP"), "terms disclose STOP");
  assert(termsText.includes("HELP for assistance") || termsText.includes("Reply HELP"), "terms disclose HELP");
  assert(termsText.toLowerCase().includes("message and data rates may apply"), "terms disclose rates");
  assert(termsText.includes("not a condition of purchasing"), "terms consent not required to purchase");
  assert(
    termsText.includes("voluntarily opt in to receive application SMS text messages"),
    "terms SMS is voluntary opt-in",
  );
  assert(
    termsText.includes("The SMS consent checkbox is not selected by default"),
    "terms disclose unchecked consent checkbox",
  );
  assert(
    termsText.includes(
      "Application SMS enrollment is separate from account authentication and two-factor authentication",
    ),
    "terms separate application SMS from 2FA",
  );
  assert(
    termsText.includes(
      "will not be combined with consent for application SMS messaging",
    ),
    "terms keep marketing SMS consent separate",
  );
  assert(privacyText.includes("SMS Messaging Privacy"), "privacy has SMS section");
  assert(privacyText.includes("replying STOP"), "privacy discloses STOP");
  assert(
    privacyText.includes("not sell, rent, or share your mobile telephone number, SMS opt-in information, or SMS consent"),
    "privacy does not sell SMS consent",
  );
  assert(termsText.includes("Sanctuary Protected LLC is a service of Unified Protective Technologies LLC"), "terms brand identity");
  assert(privacyText.includes("Sanctuary Protected LLC is a service of Unified Protective Technologies LLC"), "privacy brand identity");
  assert(attorneyNotes.some((note) => note.includes("LEGAL REVIEW REQUIRED — SMS CONSENT")), "SMS legal review flagged in source");
  assert(attorneyNotes.some((note) => note.includes("limitation of liability")), "liability flagged in source");
  assert(attorneyNotes.some((note) => note.includes("indemnification")), "indemnity flagged in source");
  assert(attorneyNotes.some((note) => note.includes("dispute resolution")), "disputes flagged in source");
  assert(attorneyNotes.some((note) => note.includes("automatic renewal")), "auto-renewal flagged in source");

  const proxySource = readRepo("lib/supabase/proxy.ts");
  assert(proxySource.includes("isLegalPublicPath"), "proxy short-circuits legal paths");
  assert(
    proxySource.indexOf("isLegalPublicPath(pathname)") < proxySource.indexOf("supabase.auth.getUser()"),
    "legal paths return before Supabase auth",
  );

  const legalPages = [
    "app/(legal)/terms/page.tsx",
    "app/(legal)/privacy/page.tsx",
    "app/(legal)/billing/page.tsx",
    "app/(legal)/sms/page.tsx",
    "components/legal/legal-page-layout.tsx",
    "components/legal/legal-document-view.tsx",
  ];
  for (const file of legalPages) {
    const source = readRepo(file);
    assert(!source.includes("createClient"), `${file} must not create a Supabase client`);
    assert(!source.includes("createServerClient"), `${file} must not use the server Supabase client`);
  }

  const loginForm = readRepo("components/login-form.tsx");
  assert(loginForm.includes('href="/terms"'), "login links to terms");
  assert(loginForm.includes('href="/privacy"'), "login links to privacy");
  assert(loginForm.includes('href="/billing"'), "login links to billing");

  const signUp = readRepo("components/sign-up-form.tsx");
  assert(signUp.includes("By creating an account"), "registration acknowledgement");
  assert(signUp.includes('href="/terms"'), "registration links to terms");
  assert(signUp.includes("defaultChecked") === false, "no pre-checked consent checkbox");
  assert(!signUp.includes('type="checkbox"'), "acknowledgement is notice text, not a pre-checked box");

  const landing = readRepo("components/landing/landing-page.tsx");
  assert(landing.includes("SiteFooter"), "landing footer includes SiteFooter");

  const billingPanel = readRepo("components/billing/billing-plan-panel.tsx");
  assert(billingPanel.includes('href="/billing"'), "checkout/plan panel links to billing policy");
  assert(billingPanel.includes('href="/terms"'), "plan panel links to terms");

  const authShell = readRepo("components/auth-page-shell.tsx");
  assert(authShell.includes("SiteFooter"), "auth pages include SiteFooter");

  const appShell = readRepo("components/app-shell.tsx");
  assert(appShell.includes("SiteFooter"), "app shell includes SiteFooter");

  const siteFooter = readRepo("components/site-footer.tsx");
  assert(siteFooter.includes("LegalLinks"), "site footer includes legal links");
  assert(siteFooter.includes("brandIdentityLine"), "site footer includes brand identity");
  assert(siteFooter.includes('data-testid="site-footer"'), "site footer test id");

  console.log("legal foundation self-check passed");
  console.log(`attorney-review source notes: ${attorneyNotes.length}`);
}

main();

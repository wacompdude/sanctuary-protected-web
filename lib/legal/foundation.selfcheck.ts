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
  LEGAL_ENTITY_NAME,
  LEGAL_NAV_ITEMS,
  LEGAL_ROUTES,
  POLICY_DATES,
  POLICY_VERSIONS,
  PRODUCT_NAME,
  copyrightYear,
  formatPolicyDate,
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
  assert(PRODUCT_NAME === "Sanctuary Protected", "product name");
  assert(LEGAL_ENTITY_NAME === null, "do not invent a legal entity name");
  assert(formatPolicyDate("2026-09-07") === "September 7, 2026", "policy date format");
  assert(copyrightYear() === 2026, "copyright year comes from policy dates");

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

  assert(
    billingText.includes("[BUSINESS/LEGAL DECISION REQUIRED — REFUND POLICY]"),
    "refund decision is flagged on the billing policy",
  );
  assert(
    billingText.includes("[BUSINESS DECISION REQUIRED — SMS OVERAGES]"),
    "SMS overage decision is flagged",
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
  assert(termsText.includes("Reply HELP"), "terms disclose HELP");
  assert(termsText.toLowerCase().includes("message and data rates may apply"), "terms disclose rates");
  assert(termsText.includes("not a condition of purchasing"), "terms consent not required to purchase");
  assert(privacyText.includes("SMS Messaging and Mobile Numbers"), "privacy has SMS section");
  assert(privacyText.includes("Reply STOP"), "privacy discloses STOP");
  assert(privacyText.includes("not sell, rent, or share SMS opt-in"), "privacy does not sell SMS consent");
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
  assert(landing.includes("LegalLinks"), "landing footer includes legal links");

  const billingPanel = readRepo("components/billing/billing-plan-panel.tsx");
  assert(billingPanel.includes('href="/billing"'), "checkout/plan panel links to billing policy");
  assert(billingPanel.includes('href="/terms"'), "plan panel links to terms");

  const authShell = readRepo("components/auth-page-shell.tsx");
  assert(authShell.includes("LegalLinks"), "auth pages include legal footer links");

  console.log("legal foundation self-check passed");
  console.log(`attorney-review source notes: ${attorneyNotes.length}`);
}

main();

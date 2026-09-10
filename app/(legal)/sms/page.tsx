import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { LegalPublicFooter } from "@/components/legal/legal-public-footer";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PublicSmsOptInForm } from "@/components/sms/public-sms-opt-in";
import { PRODUCT_NAME, PUBLIC_SITE_HOST, SUPPORT_EMAIL } from "@/lib/legal/config";
import {
  SMS_OPT_IN_HREF,
  smsHelpReply,
  smsOptInConfirmation,
} from "@/lib/sms/consent-copy";

export const metadata: Metadata = {
  title: { absolute: `${PRODUCT_NAME} SMS Messaging Opt-In` },
  description: `Enable SMS messaging from ${PRODUCT_NAME}. Members opt in from Profile → Mobile Phone → Enable SMS Messaging.`,
  robots: { index: true, follow: true },
  alternates: { canonical: SMS_OPT_IN_HREF },
};

export default function PublicSmsOptInPage() {
  return (
    <div className="min-h-app bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandLogo
            href="/"
            size={28}
            wordmarkClassName="text-base font-semibold tracking-tight"
          />
          <ThemeSwitcher />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-sm font-medium text-muted-foreground">{PRODUCT_NAME}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          SMS Messaging
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          Members enable SMS from Profile → Mobile Phone → Enable SMS Messaging.
          This is that enrollment form. Application texts are sent only after
          affirmative consent. A stored mobile number is not SMS enrollment.
        </p>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          After you agree, sign in to complete verification on your profile at{" "}
          {PUBLIC_SITE_HOST}.
        </p>

        <div className="mt-8">
          <PublicSmsOptInForm />
        </div>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">
            Automated replies
          </h2>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            These messages are sent automatically after web opt-in and when
            someone texts HELP or START to the {PRODUCT_NAME} toll-free number.
            Support: {SUPPORT_EMAIL}.
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">HELP</p>
              <p className="mt-1 text-pretty rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {smsHelpReply()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Opt-in confirmation</p>
              <p className="mt-1 text-pretty rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                {smsOptInConfirmation()}
              </p>
            </div>
          </div>
        </section>
      </main>

      <LegalPublicFooter currentPath={SMS_OPT_IN_HREF} />
    </div>
  );
}

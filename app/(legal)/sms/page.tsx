import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { LegalPublicFooter } from "@/components/legal/legal-public-footer";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { PublicSmsOptInForm } from "@/components/sms/public-sms-opt-in";
import { PUBLIC_SITE_HOST, SMS_BRAND_NAME } from "@/lib/legal/config";
import { SMS_OPT_IN_HREF } from "@/lib/sms/consent-copy";

export const metadata: Metadata = {
  title: { absolute: `${SMS_BRAND_NAME} SMS Messaging Opt-In` },
  description: `Enable SMS messaging from ${SMS_BRAND_NAME}. Members opt in from Profile → Mobile Phone → Enable SMS Messaging.`,
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
        <p className="text-sm font-medium text-muted-foreground">{SMS_BRAND_NAME}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          SMS Messaging
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          Members enable SMS from Profile. This page shows the same enrollment
          form. After you agree, sign in at {PUBLIC_SITE_HOST} to complete
          verification. A stored mobile number is not SMS enrollment.
        </p>

        <div className="mt-8">
          <PublicSmsOptInForm />
        </div>
      </main>

      <LegalPublicFooter currentPath={SMS_OPT_IN_HREF} />
    </div>
  );
}

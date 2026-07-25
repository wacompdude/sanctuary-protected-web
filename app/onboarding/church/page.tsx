import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { ChurchOnboardingForm } from "@/components/onboarding/church-onboarding-form";
import { SignOutFormButton } from "@/components/sign-out-form-button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getCurrentUser,
  getUserMemberships,
} from "@/lib/church/auth";
import { ChurchAccessError } from "@/lib/church/errors";
import { isNextControlFlowError } from "@/lib/church/access-guard";
import { getPlatformAccount } from "@/lib/platform/auth";

async function ChurchOnboardingContent() {
  let signedInEmail: string | null = null;
  let hasPlatformAccount = false;

  try {
    const { user } = await getCurrentUser();
    signedInEmail = user.email ?? null;
    const memberships = await getUserMemberships(user.id);
    if (memberships.length > 0) {
      redirect("/home");
    }

    const platformAccount = await getPlatformAccount().catch(() => null);
    hasPlatformAccount = Boolean(
      platformAccount && platformAccount.status === "active",
    );
  } catch (error) {
    if (isNextControlFlowError(error)) {
      throw error;
    }
    if (
      error instanceof ChurchAccessError &&
      error.code === "UNAUTHENTICATED"
    ) {
      redirect("/login?next=/onboarding/church");
    }
    throw error;
  }

  return (
    <>
      <div className="space-y-3">
        <BrandLogo
          href="/"
          size={36}
          wordmarkClassName="text-xl font-semibold tracking-tight"
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Set up your church
          </h1>
          <p className="mt-1 text-muted-foreground">
            Tell us about your church and primary campus to get started with
            Sanctuary Protected.
          </p>
        </div>
      </div>

      {hasPlatformAccount || signedInEmail ? (
        <Card className="border-amber-700/40 bg-amber-50/80 dark:bg-amber-950/20">
          <CardContent className="space-y-3 py-5 text-sm">
            <p className="font-medium text-amber-950 dark:text-amber-100">
              Signed in
              {signedInEmail ? ` as ${signedInEmail}` : ""}.
            </p>
            <p className="text-muted-foreground">
              This page is for creating a church with a church-user account.
              Platform administrators usually do not create a church here —
              open the platform console, or sign out and sign in with a church
              account to use the standard dashboard.
            </p>
            <div className="flex flex-wrap gap-2">
              {hasPlatformAccount ? (
                <Link
                  href="/platform"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-amber-700 px-4 text-sm font-medium text-amber-50 hover:bg-amber-800"
                >
                  Open platform console
                </Link>
              ) : null}
              <SignOutFormButton variant="outline">
                Sign out and use another account
              </SignOutFormButton>
              <Link
                href="/login?switch=1"
                className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Go to login
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <ChurchOnboardingForm />
    </>
  );
}

export default function ChurchOnboardingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading onboarding…
            </CardContent>
          </Card>
        }
      >
        <ChurchOnboardingContent />
      </Suspense>
    </div>
  );
}

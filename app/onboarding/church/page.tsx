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
} from "@/lib/organization/auth";
import { ChurchAccessError } from "@/lib/organization/errors";
import { isNextControlFlowError } from "@/lib/organization/access-guard";
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
            Create or Join a Church
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Your Sanctuary Protected account has been created. Now connect your
            account to a church.
          </p>
        </div>
      </div>

      <section aria-labelledby="join-church-heading">
        <Card>
          <CardContent className="space-y-4 py-6">
            <div className="space-y-2">
              <h2
                id="join-church-heading"
                className="text-xl font-semibold leading-none tracking-tight"
              >
                Join an Existing Church
              </h2>
              <p className="text-pretty text-sm text-muted-foreground">
                If your church already uses Sanctuary Protected, give your church
                administrator the email address you used to create this account.
                They can add you to the church.
              </p>
            </div>

            {signedInEmail ? (
              <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-3">
                <p className="text-sm font-medium">Your account email:</p>
                <p className="break-all text-sm">{signedInEmail}</p>
                <p className="pt-1 text-pretty text-sm text-muted-foreground">
                  Provide this email address to your church administrator so they
                  can add you to the church.
                </p>
              </div>
            ) : (
              <p className="text-pretty text-sm text-muted-foreground">
                Provide the email address you used to create this account. Your
                church administrator uses that email to add you.
              </p>
            )}

            <p className="text-pretty text-sm text-muted-foreground">
              Stay signed in while you wait. After you are added, refresh this
              page or sign in again to open your church.
            </p>

            <div className="flex flex-wrap gap-2">
              <SignOutFormButton variant="outline">Sign out</SignOutFormButton>
              {hasPlatformAccount ? (
                <Link
                  href="/platform"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
                >
                  Open the administration console
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="create-church-heading">
        <ChurchOnboardingForm />
      </section>
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

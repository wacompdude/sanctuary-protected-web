import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { ChurchOnboardingForm } from "@/components/onboarding/church-onboarding-form";
import { Card, CardContent } from "@/components/ui/card";
import {
  getCurrentUser,
  getUserMemberships,
} from "@/lib/church/auth";
import { ChurchAccessError } from "@/lib/church/errors";
import { isNextControlFlowError } from "@/lib/church/access-guard";

async function ChurchOnboardingContent() {
  try {
    const { user } = await getCurrentUser();
    const memberships = await getUserMemberships(user.id);
    if (memberships.length > 0) {
      redirect("/dashboard");
    }
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

import { Suspense } from "react";
import Link from "next/link";
import { ChurchOnboardingForm } from "@/components/onboarding/church-onboarding-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChurchAccessError,
  getCurrentUser,
} from "@/lib/church/auth";
import { isNextControlFlowError } from "@/lib/church/access-guard";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

async function CreateChurchContent() {
  try {
    await getCurrentUser();
  } catch (error) {
    if (isNextControlFlowError(error)) throw error;
    if (error instanceof ChurchAccessError && error.code === "UNAUTHENTICATED") {
      redirect("/login?next=/churches/new");
    }
    throw error;
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/select-church">
            <ArrowLeft className="h-4 w-4" />
            Back to church selection
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Create a church</h1>
        <p className="mt-1 text-muted-foreground">
          Add another organization you own. You will become its owner and can
          switch between churches anytime.
        </p>
      </div>

      <ChurchOnboardingForm
        title="New church"
        description="You can keep your existing church memberships. After creation, this church becomes your active context."
        submitLabel="Create and switch"
      />
    </>
  );
}

export default function CreateChurchPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <CreateChurchContent />
      </Suspense>
    </div>
  );
}

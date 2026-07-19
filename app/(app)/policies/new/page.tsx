import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PolicyForm } from "@/components/policies/policy-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { POLICY_MIGRATION_HINT } from "@/lib/policies/constants";
import {
  listCampusesForPolicies,
  listManagedPolicies,
  listPolicyCategories,
} from "@/lib/policies/queries";

async function NewPolicyContent() {
  const { church } = await requireMinChurchRole("security_leader");
  const [categories, campuses, probe] = await Promise.all([
    listPolicyCategories(church.id),
    listCampusesForPolicies(church.id),
    listManagedPolicies(church.id, { pageSize: 1 }),
  ]);

  if (!probe.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>New policy</CardTitle>
          <CardDescription>{POLICY_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/policies/manage">
            <ArrowLeft className="h-4 w-4" />
            Back to manage
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New policy</h1>
        <p className="mt-1 text-muted-foreground">
          Create a draft policy or procedure for {church.name}.
        </p>
      </div>
      <PolicyForm
        mode="create"
        categories={categories}
        campuses={campuses}
      />
    </>
  );
}

async function NewPolicyWrapper() {
  try {
    return <NewPolicyContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof ChurchAccessError || error instanceof Error
            ? error.message
            : "Unable to open the new policy form."}
        </CardContent>
      </Card>
    );
  }
}

export default function NewPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <NewPolicyWrapper />
      </Suspense>
    </div>
  );
}

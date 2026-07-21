import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CampusForm } from "@/components/campuses/campus-form";
import { createCampusAction } from "@/app/(app)/campuses/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { CAMPUS_MIGRATION_HINT } from "@/lib/campuses/constants";
import { canManageCampuses } from "@/lib/campuses/permissions";
import { listCampuses } from "@/lib/campuses/queries";

async function NewCampusContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canManageCampuses(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to create campuses.
        </CardContent>
      </Card>
    );
  }

  const result = await listCampuses(church.id, { includeArchived: true });
  if (!result.tablesAvailable) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          {result.hint ?? CAMPUS_MIGRATION_HINT}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New campus</h1>
        <p className="mt-1 text-muted-foreground">
          Add a location for {church.name}.
        </p>
      </div>
      <CampusForm
        action={createCampusAction}
        canEdit
        mode="create"
        extendedSchema={result.extendedSchema}
        defaultTimezone={church.timezone}
      />
    </div>
  );
}

export default function NewCampusPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading…
          </CardContent>
        </Card>
      }
    >
      <NewCampusLoader />
    </Suspense>
  );
}

async function NewCampusLoader() {
  try {
    return <NewCampusContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load form."}
        </CardContent>
      </Card>
    );
  }
}

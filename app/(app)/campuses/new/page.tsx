import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CampusForm } from "@/components/campuses/campus-form";
import { createCampusAction } from "@/app/(app)/campuses/actions";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { CAMPUS_MIGRATION_HINT } from "@/lib/campuses/constants";
import { loadCampusCapabilities } from "@/lib/campuses/server-auth";
import { listCampuses } from "@/lib/campuses/queries";

async function NewCampusContent() {
  const { church, capabilities } = await loadCampusCapabilities({});

  if (!capabilities.canCreate) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only an Owner, Co-owner, or Administrator can add a new campus.
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

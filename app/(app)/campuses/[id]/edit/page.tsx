import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CampusForm } from "@/components/campuses/campus-form";
import { updateCampusAction } from "@/app/(app)/campuses/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canManageCampuses } from "@/lib/campuses/permissions";
import { getCampus } from "@/lib/campuses/queries";

async function EditCampusContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const { campus, extendedSchema } = await getCampus(church.id, id);

  if (!campus) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Campus not found.
        </CardContent>
      </Card>
    );
  }

  const canEdit = canManageCampuses(membership.role);
  const boundAction = updateCampusAction.bind(null, campus.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit campus</h1>
        <p className="mt-1 text-muted-foreground">{campus.name}</p>
      </div>
      <CampusForm
        action={boundAction}
        campus={campus}
        canEdit={canEdit}
        mode="edit"
        extendedSchema={extendedSchema}
        defaultTimezone={church.timezone}
      />
    </div>
  );
}

export default function EditCampusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <EditCampusLoader params={params} />
    </Suspense>
  );
}

async function EditCampusLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    return <EditCampusContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load campus."}
        </CardContent>
      </Card>
    );
  }
}

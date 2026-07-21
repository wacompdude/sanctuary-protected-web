import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CampusSettingsPanel } from "@/components/campuses/campus-settings-panel";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  canManageCampuses,
  canViewCampuses,
} from "@/lib/campuses/permissions";
import { getCampus } from "@/lib/campuses/queries";

async function CampusSettingsContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canViewCampuses(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to view campus settings.
        </CardContent>
      </Card>
    );
  }

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

  const canManage = canManageCampuses(membership.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campus settings</h1>
          <p className="mt-1 text-muted-foreground">{campus.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/campuses/${campus.id}`}>Back to campus</Link>
          </Button>
          {canManage ? (
            <Button asChild className="h-11">
              <Link href={`/campuses/${campus.id}/edit`}>Edit details</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <CampusSettingsPanel
        campus={campus}
        canManage={canManage}
        extendedSchema={extendedSchema}
      />
    </div>
  );
}

export default function CampusSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading settings…
          </CardContent>
        </Card>
      }
    >
      <CampusSettingsLoader params={params} />
    </Suspense>
  );
}

async function CampusSettingsLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    return <CampusSettingsContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load campus settings."}
        </CardContent>
      </Card>
    );
  }
}

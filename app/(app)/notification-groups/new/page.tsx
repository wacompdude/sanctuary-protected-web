import { Suspense } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { NotificationGroupForm } from "@/components/notifications/notification-group-form";
import { createNotificationGroupAction } from "@/app/(app)/notification-groups/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canCreateNotificationGroup } from "@/lib/notifications/groups/permissions";
import { listCampusesForChurch } from "@/lib/security-hardware/queries";

async function NewGroupContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canCreate = canCreateNotificationGroup(membership.role, "custom");
  const campuses = await listCampusesForChurch(church.id).catch(() => []);

  if (!canCreate) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to create notification groups.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New group</h1>
        <p className="mt-1 text-muted-foreground">
          Create a custom notification group for {church.name}.
        </p>
      </div>
      <NotificationGroupForm
        action={createNotificationGroupAction}
        campuses={campuses.map((campus) => ({
          id: campus.id,
          name: campus.name,
        }))}
        canEdit
        mode="create"
      />
    </div>
  );
}

export default function NewNotificationGroupPage() {
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
      <NewGroupLoader />
    </Suspense>
  );
}

async function NewGroupLoader() {
  try {
    return <NewGroupContent />;
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

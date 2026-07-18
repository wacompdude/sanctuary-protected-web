import { Suspense } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { NotificationGroupForm } from "@/components/notifications/notification-group-form";
import { updateNotificationGroupAction } from "@/app/(app)/notification-groups/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canManageNotificationGroup } from "@/lib/notifications/groups/permissions";
import { getNotificationGroup } from "@/lib/notifications/groups/queries";
import { listCampusesForChurch } from "@/lib/security-hardware/queries";

async function EditGroupContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const group = await getNotificationGroup(church.id, id);

  if (!group) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Group not found.
        </CardContent>
      </Card>
    );
  }

  const canEdit = canManageNotificationGroup(
    membership.role,
    group.group_type,
    group.is_system_group,
  );
  const campuses = await listCampusesForChurch(church.id).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit group</h1>
        <p className="mt-1 text-muted-foreground">{group.name}</p>
      </div>
      <NotificationGroupForm
        action={updateNotificationGroupAction}
        group={group}
        campuses={campuses.map((campus) => ({
          id: campus.id,
          name: campus.name,
        }))}
        canEdit={canEdit}
        mode="edit"
      />
    </div>
  );
}

export default function EditNotificationGroupPage({
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
      <EditGroupLoader params={params} />
    </Suspense>
  );
}

async function EditGroupLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    return <EditGroupContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load group."}
        </CardContent>
      </Card>
    );
  }
}

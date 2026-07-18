import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotificationGroupMembersPanel } from "@/components/notifications/notification-group-members-panel";
import { NotificationGroupDefaultsForm } from "@/components/notifications/notification-group-defaults-form";
import {
  addNotificationGroupMembersAction,
  addNotificationGroupMembersByRoleAction,
  removeNotificationGroupMemberAction,
  upsertNotificationGroupDefaultAction,
} from "@/app/(app)/notification-groups/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  canManageNotificationGroup,
  canViewNotificationGroups,
} from "@/lib/notifications/groups/permissions";
import {
  getNotificationGroup,
  listNotificationGroupDefaults,
  listNotificationGroupMembers,
} from "@/lib/notifications/groups/queries";
import {
  labelForGroupStatus,
  labelForGroupType,
} from "@/lib/notifications/groups/constants";

async function GroupDetailContent({ id }: { id: string }) {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canViewNotificationGroups(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to view this group.
        </CardContent>
      </Card>
    );
  }

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

  const canManage = canManageNotificationGroup(
    membership.role,
    group.group_type,
    group.is_system_group,
  );

  const [members, defaults, team] = await Promise.all([
    listNotificationGroupMembers(church.id, group.id),
    listNotificationGroupDefaults(church.id, group.id),
    listChurchTeamMemberships(church.id).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {labelForGroupType(group.group_type)} ·{" "}
            {labelForGroupStatus(group.status)}
            {group.is_system_group ? " · System group" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/notification-groups">Back to groups</Link>
          </Button>
          {canManage ? (
            <Button asChild className="h-11">
              <Link href={`/notification-groups/${group.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            {group.description || "No description provided."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            Default severity: {group.default_notification_severity}
          </p>
          {group.dynamic_rule_type ? (
            <p>
              Dynamic rule: {group.dynamic_rule_type} ={" "}
              {group.dynamic_rule_value}
            </p>
          ) : null}
          <p>Updated {new Date(group.updated_at).toLocaleString()}</p>
        </CardContent>
      </Card>

      <NotificationGroupMembersPanel
        groupId={group.id}
        members={members}
        candidateMembers={team
          .filter((row) => row.status === "active")
          .map((row) => ({
            membershipId: row.membershipId,
            name: row.name,
            role: row.role,
          }))}
        canManage={canManage && !group.is_system_group}
        isSystemGroup={group.is_system_group}
        addAction={addNotificationGroupMembersAction}
        addByRoleAction={addNotificationGroupMembersByRoleAction}
        removeAction={removeNotificationGroupMemberAction}
      />

      <NotificationGroupDefaultsForm
        groupId={group.id}
        defaults={defaults}
        canManage={canManage}
        action={upsertNotificationGroupDefaultAction}
      />
    </div>
  );
}

export default function NotificationGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading group…
          </CardContent>
        </Card>
      }
    >
      <GroupDetailLoader params={params} />
    </Suspense>
  );
}

async function GroupDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    return <GroupDetailContent id={id} />;
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

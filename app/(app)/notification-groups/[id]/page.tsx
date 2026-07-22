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
import { NotificationGroupIncludedPanel } from "@/components/notifications/notification-group-included-panel";
import { NotificationGroupParentsPanel } from "@/components/notifications/notification-group-parents-panel";
import { NotificationGroupEffectiveMembersPanel } from "@/components/notifications/notification-group-effective-members";
import { NotificationGroupDefaultsForm } from "@/components/notifications/notification-group-defaults-form";
import {
  addNotificationGroupMembersAction,
  addNotificationGroupMembersByRoleAction,
  addNotificationGroupNestingAction,
  removeNotificationGroupMemberAction,
  removeNotificationGroupNestingAction,
  upsertNotificationGroupDefaultAction,
} from "@/app/(app)/notification-groups/actions";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import {
  canManageNotificationGroup,
  canViewNotificationGroups,
} from "@/lib/notifications/groups/permissions";
import { getGroupDetail } from "@/lib/notifications/groups/group-service";
import {
  labelForGroupStatus,
  labelForGroupType,
} from "@/lib/notifications/groups/constants";
import { formatChurchDateTime } from "@/lib/datetime/format";

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

  const detail = await getGroupDetail(church.id, id);
  if (!detail) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Group not found.
        </CardContent>
      </Card>
    );
  }

  const group = detail.group;
  const canManage = canManageNotificationGroup(
    membership.role,
    group.group_type,
    group.is_system_group,
  );

  const team = await listChurchTeamMemberships(church.id).catch(() => []);

  const showFlatteningWarning =
    !group.is_system_group &&
    detail.counts.includedGroups > 0 &&
    detail.counts.directUsers > 0;

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
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs uppercase tracking-wide">Direct users</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {detail.counts.directUsers}
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs uppercase tracking-wide">Included groups</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {detail.counts.includedGroups}
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs uppercase tracking-wide">Effective users</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {detail.counts.effectiveUsers}
              </p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs uppercase tracking-wide">Parent groups</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {detail.counts.parentGroups}
              </p>
            </div>
          </div>
          <p>Default severity: {group.default_notification_severity}</p>
          {group.dynamic_rule_type ? (
            <p>
              Dynamic rule: {group.dynamic_rule_type} ={" "}
              {group.dynamic_rule_value}
            </p>
          ) : null}
          <p>
            Updated{" "}
            {formatChurchDateTime(group.updated_at, {
              timeZone: church.timezone,
            })}
          </p>
          {showFlatteningWarning ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100">
              This group may contain members previously copied from another
              group. Review direct members after adding nested groups to avoid
              maintaining unnecessary direct assignments.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!group.is_system_group ? (
        <NotificationGroupIncludedPanel
          groupId={group.id}
          included={detail.included}
          candidateGroups={detail.nestableGroupOptions}
          canManage={canManage}
          addAction={addNotificationGroupNestingAction}
          removeAction={removeNotificationGroupNestingAction}
        />
      ) : null}

      <NotificationGroupMembersPanel
        groupId={group.id}
        members={
          group.is_system_group
            ? detail.effectiveUsers.map((user) => ({
                id: `dynamic:${user.membershipId}`,
                church_id: church.id,
                group_id: group.id,
                membership_id: user.membershipId,
                user_id: user.userId,
                status: "active" as const,
                added_by: null,
                added_at: new Date(0).toISOString(),
                removed_at: null,
                display_name: user.displayName,
                role: user.role,
              }))
            : detail.directUsers
        }
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

      {!group.is_system_group ? (
        <NotificationGroupEffectiveMembersPanel
          users={detail.effectiveUsers}
        />
      ) : null}

      <NotificationGroupParentsPanel parents={detail.parents} />

      <NotificationGroupDefaultsForm
        groupId={group.id}
        defaults={detail.defaults}
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

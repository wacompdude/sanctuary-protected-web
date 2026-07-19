import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  canCreateNotificationGroup,
  canViewNotificationGroups,
} from "@/lib/notifications/groups/permissions";
import {
  areNotificationGroupTablesAvailable,
  listNotificationGroups,
} from "@/lib/notifications/groups/queries";
import {
  labelForGroupStatus,
  labelForGroupType,
} from "@/lib/notifications/groups/constants";
import { formatChurchDate } from "@/lib/datetime/format";

async function NotificationGroupsContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canViewNotificationGroups(membership.role)) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          You do not have permission to view notification groups.
        </CardContent>
      </Card>
    );
  }

  const available = await areNotificationGroupTablesAvailable();
  if (!available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification groups not configured</CardTitle>
          <CardDescription>
            Run <code>supabase/migrations/029_notification_groups.sql</code> in
            the Supabase SQL Editor, then reload.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const groups = await listNotificationGroups(church.id, {
    includeArchived: true,
  });
  const canCreate = canCreateNotificationGroup(membership.role, "custom");

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Notification groups
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage recipient groups for {church.name}.
          </p>
        </div>
        {canCreate ? (
          <Button asChild className="h-11">
            <Link href="/notification-groups/new">
              <Plus className="h-4 w-4" />
              New group
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Groups</CardTitle>
          <CardDescription>
            {groups.length} group{groups.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No groups found. Create a custom group or confirm the migration
              seeded system groups.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Name
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Campus
                    </th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">
                      Members
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr
                      key={group.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium">
                        <Link
                          href={`/notification-groups/${group.id}`}
                          className="hover:underline"
                        >
                          {group.name}
                        </Link>
                        {group.is_system_group ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            System
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {labelForGroupType(group.group_type)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {labelForGroupStatus(group.status)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {group.campus_name ?? "All"}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {group.is_system_group
                          ? "Dynamic"
                          : group.member_count}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatChurchDate(group.updated_at, {
                          timeZone: church.timezone,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function NotificationGroupsPage() {
  return (
    <div className="space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading notification groups…
            </CardContent>
          </Card>
        }
      >
        <NotificationGroupsLoader />
      </Suspense>
    </div>
  );
}

async function NotificationGroupsLoader() {
  try {
    return <NotificationGroupsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load notification groups."}
        </CardContent>
      </Card>
    );
  }
}

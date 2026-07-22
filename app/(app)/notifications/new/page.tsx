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
import { NotificationComposerForm } from "@/components/notifications/notification-composer-form";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { labelForMembershipRole } from "@/lib/church/invitations";
import {
  canCreateOperationalNotifications,
  canManageChurchNotificationSettings,
} from "@/lib/notifications/permissions";
import {
  areNotificationGroupTablesAvailable,
  listNotificationGroups,
} from "@/lib/notifications/groups/queries";
import { getChurchNotificationSettings } from "@/lib/notifications/settings";

async function ComposerContent() {
  const { supabase, church, membership } =
    await getAuthenticatedUserWithChurch();

  if (!canCreateOperationalNotifications(membership.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compose notification</CardTitle>
          <CardDescription>
            Security leaders and administrators can send group notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="h-11">
            <Link href="/notifications">Back to notifications</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const groupsAvailable = await areNotificationGroupTablesAvailable();
  const [groups, team, settings] = await Promise.all([
    groupsAvailable
      ? listNotificationGroups(church.id, { includeArchived: false })
      : Promise.resolve([]),
    listChurchTeamMemberships(church.id).catch(() => []),
    getChurchNotificationSettings(supabase, church.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Compose notification
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Send to notification groups for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/notification-groups">Manage groups</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/notifications/history">Delivery history</Link>
          </Button>
        </div>
      </div>

      {!groupsAvailable ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Notification groups are not configured. Run{" "}
            <code>029_notification_groups.sql</code>, then reload.
          </CardContent>
        </Card>
      ) : null}

      <NotificationComposerForm
        groups={groups
          .filter((group) => group.status === "active")
          .map((group) => ({
            id: group.id,
            name: group.name,
            group_type: group.group_type,
            is_system_group: group.is_system_group,
            member_count: group.member_count,
            included_group_count: group.included_group_count,
          }))}
        members={team
          .filter((row) => row.status === "active")
          .map((row) => ({
            membershipId: row.membershipId,
            name: row.name,
            role: labelForMembershipRole(row.role),
          }))}
        canEmergencyOverride={canManageChurchNotificationSettings(
          membership.role,
        )}
        smsConfigured={settings.sms_notifications_enabled}
        pushConfigured={settings.push_notifications_enabled}
      />
    </div>
  );
}

export default function NewNotificationPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading composer…
          </CardContent>
        </Card>
      }
    >
      <ComposerLoader />
    </Suspense>
  );
}

async function ComposerLoader() {
  try {
    return <ComposerContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load notification composer."}
        </CardContent>
      </Card>
    );
  }
}

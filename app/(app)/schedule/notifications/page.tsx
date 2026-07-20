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
import { ScheduleNotificationComposer } from "@/components/schedule/schedule-notification-composer";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { labelForMembershipRole } from "@/lib/church/invitations";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { labelForNotificationType } from "@/lib/notifications/constants";
import {
  areNotificationGroupTablesAvailable,
  listNotificationGroups,
} from "@/lib/notifications/groups/queries";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { listScheduleEvents } from "@/lib/schedule/queries";
import { listScheduleShifts } from "@/lib/schedule/shift-queries";
import { SCHEDULE_MIGRATION_HINT } from "@/lib/schedule/constants";

async function listRecentScheduleNotifications(churchId: string) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, notification_type, severity, status, created_at")
    .eq("church_id", churchId)
    .like("notification_type", "schedule.%")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    if (/does not exist|relation/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function NotificationsContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();

  if (!canManageSchedule(membership.role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule notifications</CardTitle>
          <CardDescription>
            Security leaders and administrators can send schedule messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/schedule/calendar">Back to calendar</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const groupsAvailable = await areNotificationGroupTablesAvailable();
  const [groups, team, events, shifts, recent] = await Promise.all([
    groupsAvailable
      ? listNotificationGroups(church.id, { includeArchived: false })
      : Promise.resolve([]),
    listChurchTeamMemberships(church.id).catch(() => []),
    listScheduleEvents(church.id, {
      pageSize: 50,
      includeCancelled: false,
    }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      tablesAvailable: false,
    })),
    listScheduleShifts(church.id, { pageSize: 50 }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      tablesAvailable: false,
    })),
    listRecentScheduleNotifications(church.id).catch(() => []),
  ]);

  if (events.tablesAvailable === false || shifts.tablesAvailable === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule notifications</CardTitle>
          <CardDescription>{SCHEDULE_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tz = church.timezone ?? "America/Los_Angeles";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Schedule notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Message groups or individuals about shifts and events for{" "}
            {church.name}. Automated reminders use the existing email dispatch
            pipeline.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/notifications">Inbox</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/notifications/history">Delivery history</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/notification-groups">Manage groups</Link>
          </Button>
        </div>
      </div>

      {!groupsAvailable ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Notification groups are not configured. Run{" "}
            <code>029_notification_groups.sql</code>, then reload. You can still
            target individual members.
          </CardContent>
        </Card>
      ) : null}

      <ScheduleNotificationComposer
        groups={groups
          .filter((group) => group.status === "active")
          .map((group) => ({
            id: group.id,
            name: group.name,
            member_count: group.member_count,
          }))}
        members={team
          .filter((row) => row.status === "active")
          .map((row) => ({
            membershipId: row.membershipId,
            name: row.name,
            role: labelForMembershipRole(row.role),
          }))}
        events={events.items.map((event) => ({
          id: event.id,
          title: event.title,
        }))}
        shifts={shifts.items.map((shift) => ({
          id: shift.id,
          title: shift.title,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent schedule notifications</CardTitle>
          <CardDescription>
            Last 25 schedule.* messages for this church. Full delivery detail is
            in notification history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No schedule notifications yet.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {recent.map((row) => (
                <li
                  key={row.id as string}
                  className="flex flex-wrap items-start justify-between gap-2 px-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{String(row.title ?? "")}</p>
                    <p className="text-muted-foreground">
                      {labelForNotificationType(
                        String(row.notification_type ?? ""),
                      )}{" "}
                      · {String(row.severity ?? "")} ·{" "}
                      {String(row.status ?? "")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatChurchDateTime(String(row.created_at ?? ""), {
                      timeZone: tz,
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ScheduleNotificationsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading schedule notifications…
          </CardContent>
        </Card>
      }
    >
      <NotificationsLoader />
    </Suspense>
  );
}

async function NotificationsLoader() {
  try {
    return <NotificationsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load schedule notifications."}
        </CardContent>
      </Card>
    );
  }
}

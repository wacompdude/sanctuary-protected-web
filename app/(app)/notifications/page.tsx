import Link from "next/link";
import { Suspense } from "react";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  areNotificationTablesAvailable,
  countUnreadNotifications,
  labelForNotificationType,
  listUserNotifications,
} from "@/lib/notifications";
import { NotificationSeverityBadge } from "@/components/notifications/notification-severity-badge";
import {
  acknowledgeNotificationFormAction,
  dismissNotificationFormAction,
  markNotificationReadFormAction,
  markNotificationUnreadFormAction,
} from "@/app/(app)/notifications/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function NotificationsContent({
  unreadOnly,
}: {
  unreadOnly: boolean;
}) {
  const { supabase, church, user } = await getAuthenticatedUserWithChurch();
  const tablesAvailable = await areNotificationTablesAvailable(supabase);

  if (!tablesAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {church.name}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Notifications not configured</CardTitle>
            <CardDescription>
              The notification tables are missing in this database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Apply{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                supabase/migrations/027_notifications.sql
              </code>{" "}
              in your production Supabase SQL editor, then reload this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [items, unreadCount] = await Promise.all([
    listUserNotifications(supabase, {
      churchId: church.id,
      userId: user.id,
      unreadOnly,
      limit: 100,
    }),
    countUnreadNotifications(supabase, church.id, user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {church.name} · {unreadCount} unread
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            asChild
            variant={unreadOnly ? "default" : "outline"}
            className="h-11"
          >
            <Link href="/notifications?filter=unread">Unread</Link>
          </Button>
          <Button
            asChild
            variant={!unreadOnly ? "default" : "outline"}
            className="h-11"
          >
            <Link href="/notifications">All</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/notifications/preferences">Preferences</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My notifications</CardTitle>
          <CardDescription>
            Sensitive details stay in the app. Emails are intentionally minimal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notifications for this filter.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border p-3 sm:p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <NotificationSeverityBadge severity={item.severity} />
                    <p className="text-sm font-medium">
                      {labelForNotificationType(item.notificationType)}
                    </p>
                    {!item.readAt ? (
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Unread
                      </span>
                    ) : null}
                    {item.requiresAcknowledgment && !item.acknowledgedAt ? (
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                        Acknowledgment required
                      </span>
                    ) : null}
                  </div>

                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.summary ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {item.summary}
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="h-10">
                      <Link href={`/notifications/${item.notificationId}`}>
                        Open details
                      </Link>
                    </Button>
                    {item.actionUrl ? (
                      <Button asChild size="sm" variant="outline" className="h-10">
                        <Link href={item.actionUrl}>Open related record</Link>
                      </Button>
                    ) : null}

                    {!item.readAt ? (
                      <form action={markNotificationReadFormAction}>
                        <input type="hidden" name="notification_id" value={item.notificationId} />
                        <Button type="submit" size="sm" variant="secondary" className="h-10">
                          Mark read
                        </Button>
                      </form>
                    ) : (
                      <form action={markNotificationUnreadFormAction}>
                        <input type="hidden" name="notification_id" value={item.notificationId} />
                        <Button type="submit" size="sm" variant="outline" className="h-10">
                          Mark unread
                        </Button>
                      </form>
                    )}

                    {item.requiresAcknowledgment && !item.acknowledgedAt ? (
                      <form action={acknowledgeNotificationFormAction}>
                        <input type="hidden" name="notification_id" value={item.notificationId} />
                        <Button type="submit" size="sm" className="h-10">
                          Acknowledge
                        </Button>
                      </form>
                    ) : null}

                    <form action={dismissNotificationFormAction}>
                      <input type="hidden" name="notification_id" value={item.notificationId} />
                      <Button type="submit" size="sm" variant="ghost" className="h-10">
                        Dismiss
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function NotificationsWrapper({ unreadOnly }: { unreadOnly: boolean }) {
  try {
    return <NotificationsContent unreadOnly={unreadOnly} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load notifications."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function NotificationsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = searchParams ?? {};
  const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const unreadOnly = filter === "unread";

  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading notifications...
          </CardContent>
        </Card>
      }
    >
      <NotificationsWrapper unreadOnly={unreadOnly} />
    </Suspense>
  );
}

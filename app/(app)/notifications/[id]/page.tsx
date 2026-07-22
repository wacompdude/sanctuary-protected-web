import Link from "next/link";
import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canViewNotificationHistory } from "@/lib/notifications/permissions";
import { labelForNotificationType } from "@/lib/notifications";
import { NotificationSeverityBadge } from "@/components/notifications/notification-severity-badge";
import { acknowledgeNotificationFormAction } from "@/app/(app)/notifications/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatChurchDateTime } from "@/lib/datetime/format";

async function NotificationDetailContent({ id }: { id: string }) {
  const { supabase, church, user, membership } = await getAuthenticatedUserWithChurch();
  const canViewAll = canViewNotificationHistory(membership.role);

  const { data: recipientRow, error: recipientError } = await supabase
    .from("notification_recipients")
    .select("id, read_at, acknowledged_at, dismissed_at, user_id")
    .eq("notification_id", id)
    .eq("user_id", user.id)
    .eq("church_id", church.id)
    .maybeSingle();
  if (recipientError) throw new Error(recipientError.message);

  if (!recipientRow && !canViewAll) {
    throw new ChurchAccessError(
      "You do not have access to this notification.",
      "FORBIDDEN_ROLE",
    );
  }

  const { data: notification, error: notificationError } = await supabase
    .from("notifications")
    .select("*")
    .eq("id", id)
    .eq("church_id", church.id)
    .maybeSingle();
  if (notificationError) throw new Error(notificationError.message);
  if (!notification) {
    throw new Error("Notification not found.");
  }

  const { data: deliveries } = await supabase
    .from("notification_deliveries")
    .select(
      "id, channel, provider, status, attempt_number, max_attempts, sent_at, delivered_at, failed_at, last_error_code, last_error_message",
    )
    .eq("notification_id", id)
    .order("created_at", { ascending: false });

  const rows = (deliveries ?? []) as Array<{
    id: string;
    channel: string;
    provider: string;
    status: string;
    attempt_number: number;
    max_attempts: number;
    sent_at: string | null;
    delivered_at: string | null;
    failed_at: string | null;
    last_error_code: string | null;
    last_error_message: string | null;
  }>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Notification detail
        </h1>
        <Button asChild variant="outline" className="h-11">
          <Link href="/notifications">Back to notifications</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationSeverityBadge severity={notification.severity} />
            <CardDescription>
              {labelForNotificationType(notification.notification_type)}
            </CardDescription>
          </div>
          <CardTitle>{notification.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="whitespace-pre-wrap text-sm">{notification.body}</p>
          {notification.summary ? (
            <p className="text-sm text-muted-foreground">{notification.summary}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Created{" "}
            {formatChurchDateTime(notification.created_at, {
              timeZone: church.timezone,
            })}
          </p>
          {notification.action_url ? (
            <Button asChild size="sm" className="h-10">
              <Link href={notification.action_url}>Open related record</Link>
            </Button>
          ) : null}
          {notification.requires_acknowledgment && !recipientRow?.acknowledged_at ? (
            <form action={acknowledgeNotificationFormAction}>
              <input type="hidden" name="notification_id" value={id} />
              <Button type="submit" size="sm" variant="outline" className="h-10">
                Acknowledge notification
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery status</CardTitle>
          <CardDescription>
            {canViewAll
              ? "All channel deliveries for this notification."
              : "Shows deliveries for your recipient record. Leaders can view full history under Notification history."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>No delivery rows recorded for this view.</p>
              <p>
                If this notification was just created and email/in-app alerts were
                expected, deliveries may have failed to insert. Try resending the
                incident alert, or check that{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  SUPABASE_SERVICE_ROLE_KEY
                </code>{" "}
                is configured on the server.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium">
                    {row.channel} · {row.status.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Provider {row.provider} · attempt {row.attempt_number}/
                    {row.max_attempts}
                  </p>
                  {row.last_error_message ? (
                    <p className="mt-1 text-sm text-destructive">
                      {row.last_error_message}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function NotificationDetailLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    return <NotificationDetailContent id={id} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load notification detail."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading notification...
          </CardContent>
        </Card>
      }
    >
      <NotificationDetailLoader params={params} />
    </Suspense>
  );
}

import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canViewNotificationHistory } from "@/lib/notifications";
import { retryNotificationDeliveryFormAction } from "@/app/(app)/notifications/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

async function NotificationHistoryContent() {
  const { supabase, church, membership } = await getAuthenticatedUserWithChurch();
  if (!canViewNotificationHistory(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to view notification history.",
      "FORBIDDEN_ROLE",
    );
  }

  const { data, error } = await supabase
    .from("notification_deliveries")
    .select(
      `
      id,
      channel,
      provider,
      status,
      attempt_number,
      max_attempts,
      sent_at,
      failed_at,
      last_error_code,
      last_error_message,
      suppression_reason,
      created_at,
      recipient:notification_recipients!inner (
        display_name,
        recipient_address
      ),
      notification:notifications!inner (
        id,
        title,
        notification_type,
        severity
      )
    `,
    )
    .eq("church_id", church.id)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) throw new Error(error.message);

  const deliveries = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const recipient = Array.isArray(row.recipient)
        ? (row.recipient[0] as Record<string, unknown> | undefined)
        : ((row.recipient ?? null) as Record<string, unknown> | null);
      const notification = Array.isArray(row.notification)
        ? (row.notification[0] as Record<string, unknown> | undefined)
        : ((row.notification ?? null) as Record<string, unknown> | null);
      if (!notification) return null;
      return {
        id: String(row.id ?? ""),
        channel: String(row.channel ?? ""),
        provider: String(row.provider ?? ""),
        status: String(row.status ?? ""),
        attempt_number: Number(row.attempt_number ?? 0),
        max_attempts: Number(row.max_attempts ?? 0),
        sent_at: (row.sent_at as string | null) ?? null,
        failed_at: (row.failed_at as string | null) ?? null,
        last_error_code: (row.last_error_code as string | null) ?? null,
        last_error_message: (row.last_error_message as string | null) ?? null,
        suppression_reason:
          (row.suppression_reason as string | null) ?? null,
        created_at: String(row.created_at ?? ""),
        recipient: {
          display_name: (recipient?.display_name as string | null) ?? null,
          recipient_address: (recipient?.recipient_address as string | null) ?? null,
        },
        notification: {
          id: String(notification.id ?? ""),
          title: String(notification.title ?? ""),
          notification_type: String(notification.notification_type ?? ""),
          severity: String(notification.severity ?? "informational"),
        },
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        channel: string;
        provider: string;
        status: string;
        attempt_number: number;
        max_attempts: number;
        sent_at: string | null;
        failed_at: string | null;
        last_error_code: string | null;
        last_error_message: string | null;
        suppression_reason: string | null;
        created_at: string;
        recipient: { display_name: string | null; recipient_address: string | null };
        notification: {
          id: string;
          title: string;
          notification_type: string;
          severity: string;
        };
      } => item != null,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Notification delivery history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Recent delivery activity for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>
            Status and retry information across channels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deliveries recorded yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {deliveries.map((delivery) => (
                <li key={delivery.id} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="font-medium">{delivery.notification.title}</p>
                    <span className="rounded border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {delivery.channel}
                    </span>
                    <span className="rounded border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {delivery.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    To {delivery.recipient.display_name || "recipient"}
                    {delivery.recipient.recipient_address
                      ? ` (${delivery.recipient.recipient_address})`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Provider: {delivery.provider} · attempts {delivery.attempt_number}/
                    {delivery.max_attempts}
                  </p>
                  {delivery.last_error_message ? (
                    <p className="mt-1 text-sm text-destructive">
                      {delivery.last_error_message}
                    </p>
                  ) : null}
                  {delivery.suppression_reason ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Suppressed:{" "}
                      {delivery.suppression_reason.replaceAll("_", " ")}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="h-10">
                      <Link href={`/notifications/${delivery.notification.id}`}>
                        Open notification
                      </Link>
                    </Button>
                    {["failed", "bounced", "rejected", "suppressed"].includes(
                      delivery.status,
                    ) ? (
                      <form action={retryNotificationDeliveryFormAction}>
                        <input type="hidden" name="delivery_id" value={delivery.id} />
                        <Button type="submit" size="sm" className="h-10">
                          Retry
                        </Button>
                      </form>
                    ) : null}
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

async function NotificationHistoryWrapper() {
  try {
    return <NotificationHistoryContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load notification history."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function NotificationHistoryPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading delivery history...
          </CardContent>
        </Card>
      }
    >
      <NotificationHistoryWrapper />
    </Suspense>
  );
}

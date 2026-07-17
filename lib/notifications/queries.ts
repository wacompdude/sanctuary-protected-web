import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationSeverity } from "@/lib/notifications/types";

export type UserNotificationListItem = {
  id: string;
  notificationId: string;
  churchId: string;
  title: string;
  summary: string | null;
  severity: NotificationSeverity;
  notificationType: string;
  actionUrl: string | null;
  requiresAcknowledgment: boolean;
  createdAt: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  dismissedAt: string | null;
};

export async function listUserNotifications(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    limit?: number;
    unreadOnly?: boolean;
  },
): Promise<UserNotificationListItem[]> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);

  let query = supabase
    .from("notification_recipients")
    .select(
      `
      id,
      read_at,
      acknowledged_at,
      dismissed_at,
      created_at,
      notification:notifications!inner (
        id,
        church_id,
        title,
        summary,
        severity,
        notification_type,
        action_url,
        requires_acknowledgment,
        created_at,
        status
      )
    `,
    )
    .eq("church_id", params.churchId)
    .eq("user_id", params.userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const notification = row.notification as Record<string, unknown> | null;
      if (!notification) return null;
      if (notification.status === "cancelled") return null;
      return {
        id: String(row.id),
        notificationId: String(notification.id),
        churchId: String(notification.church_id),
        title: String(notification.title),
        summary: (notification.summary as string | null) ?? null,
        severity: notification.severity as NotificationSeverity,
        notificationType: String(notification.notification_type),
        actionUrl: (notification.action_url as string | null) ?? null,
        requiresAcknowledgment: Boolean(notification.requires_acknowledgment),
        createdAt: String(notification.created_at ?? row.created_at),
        readAt: (row.read_at as string | null) ?? null,
        acknowledgedAt: (row.acknowledged_at as string | null) ?? null,
        dismissedAt: (row.dismissed_at as string | null) ?? null,
      } satisfies UserNotificationListItem;
    })
    .filter((item): item is UserNotificationListItem => item != null);
}

export async function countUnreadNotifications(
  supabase: SupabaseClient,
  churchId: string,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("notification_recipients")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("user_id", userId)
    .is("read_at", null)
    .is("dismissed_at", null);

  if (error) {
    if (/does not exist/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

/** Returns false when migration 027 has not been applied. */
export async function areNotificationTablesAvailable(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .limit(1);
  if (!error) return true;
  return !/does not exist|schema cache|Could not find the table/i.test(
    error.message,
  );
}

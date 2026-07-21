import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampusFilterSelection } from "@/lib/campuses/filter";
import { matchesCampusFilter } from "@/lib/campuses/filter";
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
  campusId: string | null;
};

export async function listUserNotifications(
  supabase: SupabaseClient,
  params: {
    churchId: string;
    userId: string;
    limit?: number;
    unreadOnly?: boolean;
    campusFilter?: CampusFilterSelection | null;
  },
): Promise<UserNotificationListItem[]> {
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const fetchLimit = params.campusFilter ? Math.min(limit * 3, 150) : limit;

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
        campus_id,
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
    .limit(fetchLimit);

  if (params.unreadOnly) {
    query = query.is("read_at", null);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return [];
    }
    if (/campus_id/i.test(error.message)) {
      // Legacy schema without notifications.campus_id — skip campus filtering.
      let legacy = supabase
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
      if (params.unreadOnly) legacy = legacy.is("read_at", null);
      const legacyResult = await legacy;
      if (legacyResult.error) {
        if (/does not exist/i.test(legacyResult.error.message)) return [];
        throw new Error(legacyResult.error.message);
      }
      return ((legacyResult.data ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const rawNotification = row.notification;
          const notification = (
            Array.isArray(rawNotification)
              ? rawNotification[0]
              : rawNotification
          ) as Record<string, unknown> | null | undefined;
          if (!notification || notification.status === "cancelled") return null;
          return {
            id: String(row.id),
            notificationId: String(notification.id),
            churchId: String(notification.church_id),
            title: String(notification.title),
            summary: (notification.summary as string | null) ?? null,
            severity: notification.severity as NotificationSeverity,
            notificationType: String(notification.notification_type),
            actionUrl: (notification.action_url as string | null) ?? null,
            requiresAcknowledgment: Boolean(
              notification.requires_acknowledgment,
            ),
            createdAt: String(notification.created_at ?? row.created_at),
            readAt: (row.read_at as string | null) ?? null,
            acknowledgedAt: (row.acknowledged_at as string | null) ?? null,
            dismissedAt: (row.dismissed_at as string | null) ?? null,
            campusId: null as string | null,
          } satisfies UserNotificationListItem;
        })
        .filter((item): item is UserNotificationListItem => item != null);
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const rawNotification = row.notification;
      const notification = (
        Array.isArray(rawNotification) ? rawNotification[0] : rawNotification
      ) as Record<string, unknown> | null | undefined;
      if (!notification) return null;
      if (notification.status === "cancelled") return null;
      const campusId = (notification.campus_id as string | null) ?? null;
      if (
        params.campusFilter &&
        !matchesCampusFilter(campusId, params.campusFilter)
      ) {
        return null;
      }
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
        campusId,
      } satisfies UserNotificationListItem;
    })
    .filter((item): item is UserNotificationListItem => item != null)
    .slice(0, limit);
}

export async function countUnreadNotifications(
  supabase: SupabaseClient,
  churchId: string,
  userId: string,
  campusFilter?: CampusFilterSelection | null,
): Promise<number> {
  if (campusFilter) {
    const unread = await listUserNotifications(supabase, {
      churchId,
      userId,
      unreadOnly: true,
      limit: 100,
      campusFilter,
    });
    return unread.length;
  }

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

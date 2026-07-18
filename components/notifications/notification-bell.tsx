"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserNotificationListItem } from "@/lib/notifications/queries";
import { labelForNotificationType } from "@/lib/notifications/constants";
import { markAllNotificationsReadAction } from "@/app/(app)/notifications/actions";

export function NotificationBell({
  unreadCount,
  recentUnread,
}: {
  unreadCount: number;
  recentUnread: UserNotificationListItem[];
}) {
  const [isPending, startTransition] = useTransition();

  function clearAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-11 w-11"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,92vw)] p-0">
        <div className="flex items-start justify-between gap-2 p-3">
          <div>
            <DropdownMenuLabel className="px-0 py-0 text-sm">
              Notifications
            </DropdownMenuLabel>
            <p className="text-xs text-muted-foreground">
              {unreadCount} unread
            </p>
          </div>
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs"
              disabled={isPending}
              onClick={clearAll}
            >
              {isPending ? "Clearing…" : "Clear all"}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[22rem] overflow-y-auto p-2">
          {recentUnread.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              You have no unread notifications.
            </p>
          ) : (
            <ul className="space-y-1">
              {recentUnread.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/notifications/${item.notificationId}`}
                    className="block rounded-md border border-border px-3 py-2 hover:bg-accent"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <Badge variant="secondary" className="shrink-0">
                        {item.severity}
                      </Badge>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {item.summary || labelForNotificationType(item.notificationType)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 p-2">
          <Button asChild variant="ghost" size="sm" className="h-10 w-full">
            <Link href="/notifications">Open notification center</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

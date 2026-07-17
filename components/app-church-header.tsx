import Link from "next/link";
import { requireChurchMembership } from "@/lib/church/auth";
import { ChurchAccessError } from "@/lib/church/errors";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { ChurchSwitcher } from "@/components/church-switcher";
import { ChurchIdentity } from "@/components/church-identity";
import { SyncActiveChurchCookie } from "@/components/sync-active-church-cookie";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { countUnreadNotifications, listUserNotifications } from "@/lib/notifications";

export async function AppChurchHeader() {
  try {
    const { supabase, user, church, memberships, cookieSyncChurchId } =
      await requireChurchMembership();

    const { data: branding } = await supabase
      .from("churches")
      .select("logo_path")
      .eq("id", church.id)
      .maybeSingle();

    const logoPath =
      branding && typeof branding === "object" && "logo_path" in branding
        ? ((branding as { logo_path: string | null }).logo_path ?? null)
        : null;

    const churchOptions = memberships.map((membership) => ({
      id: membership.church_id,
      name: membership.church.name,
      role: membership.role,
    }));

    const [unreadCount, recentUnread] = await Promise.all([
      countUnreadNotifications(supabase, church.id, user.id).catch(() => 0),
      listUserNotifications(supabase, {
        churchId: church.id,
        userId: user.id,
        unreadOnly: true,
        limit: 8,
      }).catch(() => []),
    ]);

    return (
      <header className="mb-4 flex flex-col gap-3 border-b border-border pb-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
        {cookieSyncChurchId ? (
          <SyncActiveChurchCookie churchId={cookieSyncChurchId} />
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active church
          </p>
          <ChurchIdentity name={church.name} logoPath={logoPath} />
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:max-w-sm sm:flex-col sm:items-end">
          <NotificationBell unreadCount={unreadCount} recentUnread={recentUnread} />
          {memberships.length > 1 ? (
            <div className="hidden w-full sm:block">
              <ChurchSwitcher churches={churchOptions} activeChurchId={church.id} />
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="hidden w-full sm:inline-flex sm:w-auto"
            asChild
          >
            <Link href="/select-church">
              <ArrowLeftRight className="h-4 w-4" />
              {memberships.length > 1 ? "Manage church selection" : "Your churches"}
            </Link>
          </Button>
        </div>
      </header>
    );
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    if (error instanceof ChurchAccessError) {
      return null;
    }
    throw error;
  }
}

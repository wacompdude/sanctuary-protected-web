import Link from "next/link";
import { requireChurchMembership } from "@/lib/church/auth";
import { ChurchAccessError } from "@/lib/church/errors";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { ChurchSwitcher } from "@/components/church-switcher";
import { ChurchIdentity } from "@/components/church-identity";
import { SyncActiveChurchCookie } from "@/components/sync-active-church-cookie";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight } from "lucide-react";

export async function AppChurchHeader() {
  try {
    const { supabase, church, memberships, cookieSyncChurchId } =
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

    return (
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        {cookieSyncChurchId ? (
          <SyncActiveChurchCookie churchId={cookieSyncChurchId} />
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active church
          </p>
          <ChurchIdentity name={church.name} logoPath={logoPath} />
        </div>
        <div className="flex w-full flex-col gap-2 sm:max-w-sm sm:items-end">
          {memberships.length > 1 ? (
            <ChurchSwitcher
              churches={churchOptions}
              activeChurchId={church.id}
            />
          ) : null}
          <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
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

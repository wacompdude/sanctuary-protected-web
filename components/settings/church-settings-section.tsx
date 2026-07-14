import { Suspense, type ReactNode } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ChurchAccessError,
  requireMinChurchRole,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  canManageChurchAccountStatus,
  canManageChurchSettings,
  CHURCH_SETTINGS_SELECT,
  migrationHintFromError,
  normalizeChurchSettings,
  type ChurchSettingsRecord,
} from "@/lib/church/settings";
import { CHURCH_SETTINGS_SECTIONS } from "@/lib/church/settings-nav";
import type { ChurchSettingsSectionId } from "@/lib/church/settings-nav";
import { ChurchSettingsNav } from "@/components/settings/church-settings-nav";

export type ChurchSettingsPageData = {
  church: ReturnType<typeof normalizeChurchSettings>;
  canEdit: boolean;
  isOwner: boolean;
};

async function loadChurchSettingsPage(): Promise<
  | { ok: true; data: ChurchSettingsPageData }
  | { ok: false; node: ReactNode }
> {
  const context = await requireMinChurchRole("security_leader");
  const canEdit = canManageChurchSettings(context.membership.role);
  const isOwner = canManageChurchAccountStatus(context.membership.role);

  const { data, error } = await context.supabase
    .from("churches")
    .select(CHURCH_SETTINGS_SELECT)
    .eq("id", context.church.id)
    .maybeSingle();

  if (error) {
    const hint = migrationHintFromError(error.message);
    return {
      ok: false,
      node: (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              {hint ?? "Unable to load church settings."}
            </p>
            {hint && (
              <p className="mt-2 text-sm text-muted-foreground">
                Run{" "}
                <code>supabase/migrations/017_church_settings.sql</code> in the
                Supabase SQL Editor, then refresh this page.
              </p>
            )}
          </CardContent>
        </Card>
      ),
    };
  }

  if (!data) {
    return {
      ok: false,
      node: (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">Church not found.</p>
          </CardContent>
        </Card>
      ),
    };
  }

  const church = normalizeChurchSettings(
    data as unknown as ChurchSettingsRecord,
  );

  return {
    ok: true,
    data: { church, canEdit, isOwner },
  };
}

function sectionMeta(sectionId: ChurchSettingsSectionId) {
  return CHURCH_SETTINGS_SECTIONS.find((section) => section.id === sectionId)!;
}

export async function ChurchSettingsSectionPage({
  sectionId,
  children,
}: {
  sectionId: ChurchSettingsSectionId;
  children: (data: ChurchSettingsPageData) => ReactNode;
}) {
  try {
    const result = await loadChurchSettingsPage();
    if (!result.ok) return result.node;

    const section = sectionMeta(sectionId);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Church settings</h1>
          <p className="mt-1 text-muted-foreground">
            {section.description} Settings for {result.data.church.name}.
          </p>
          {!result.data.canEdit && (
            <p className="mt-2 text-sm text-muted-foreground">
              You can view these settings. Only owners and administrators can
              make changes.
            </p>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <ChurchSettingsNav />
          <div className="min-w-0 space-y-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {section.label}
              </h2>
            </div>
            {children(result.data)}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    if (error instanceof ChurchAccessError && error.code === "FORBIDDEN_ROLE") {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              You do not have permission to view church settings.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask a church owner, administrator, or security leader if you need
              access.
            </p>
          </CardContent>
        </Card>
      );
    }

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load church settings.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export function ChurchSettingsSectionFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading church settings…
      </CardContent>
    </Card>
  );
}

export function ChurchSettingsSectionSuspense({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<ChurchSettingsSectionFallback />}>{children}</Suspense>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { DashboardSettingsForm } from "@/components/dashboard/dashboard-settings-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auditDashboardObsoleteKeysPurged } from "@/lib/audit/dashboard-events";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import {
  areDashboardBoxSettingsAvailable,
  canManageDashboardCustomization,
  canViewDashboardCustomization,
  purgeObsoleteChurchDashboardBoxSettings,
  resolveDashboardBoxSettingsForEditor,
} from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";

async function DashboardSettingsContent() {
  const { user, church, membership } = await getAuthenticatedUserWithChurch();
  const canView = canViewDashboardCustomization(membership.role);
  const canEdit = canManageDashboardCustomization(membership.role);

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            Only administrators and owners can customize dashboard boxes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (canEdit) {
    const supabase = await createClient();
    const purge = await purgeObsoleteChurchDashboardBoxSettings({
      supabase,
      churchId: church.id,
    });
    if (purge.ok && purge.purgedKeys.length > 0) {
      await auditDashboardObsoleteKeysPurged(supabase, {
        churchId: church.id,
        userId: user.id,
        obsoleteKeys: purge.purgedKeys,
      });
    }
  }

  const [settings, migrationAvailable] = await Promise.all([
    resolveDashboardBoxSettingsForEditor(church.id, membership.role),
    areDashboardBoxSettingsAvailable(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard boxes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Choose which summary boxes appear for {church.name}, their order, and
            colors. Changes apply church-wide.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11">
          <Link href="/dashboard">View dashboard</Link>
        </Button>
      </div>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          You can view these settings. Only administrators and owners can edit
          them.
        </p>
      ) : null}

      <DashboardSettingsForm
        initialSettings={settings}
        canEdit={canEdit}
        migrationAvailable={migrationAvailable}
      />
    </div>
  );
}

export default function DashboardSettingsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading dashboard settings…
          </CardContent>
        </Card>
      }
    >
      <SettingsLoader />
    </Suspense>
  );
}

async function SettingsLoader() {
  try {
    return <DashboardSettingsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load dashboard settings."}
        </CardContent>
      </Card>
    );
  }
}

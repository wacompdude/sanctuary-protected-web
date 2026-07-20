import Link from "next/link";
import { Suspense } from "react";
import { ScheduleSettingsForm } from "@/components/schedule/schedule-settings-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { SCHEDULE_MIGRATION_HINT } from "@/lib/schedule/constants";
import { canManageScheduleSettings } from "@/lib/schedule/permissions";
import { ensureChurchScheduleSettings, getTypedChurchScheduleSettings } from "@/lib/schedule/settings-queries";

async function SchedulingSettingsContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canEdit = canManageScheduleSettings(membership.role);
  const settings = canEdit
    ? await ensureChurchScheduleSettings(church.id, church.timezone)
    : await getTypedChurchScheduleSettings(church.id);

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scheduling settings</CardTitle>
          <CardDescription>{SCHEDULE_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Scheduling settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Calendar preferences, notification defaults, and member permissions
            for {church.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/schedule/templates">Templates</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/schedule/notifications">Schedule notifications</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/schedule/calendar">Calendar</Link>
          </Button>
        </div>
      </div>

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          You can view these settings. Only administrators and owners can edit
          them.
        </p>
      ) : null}

      <ScheduleSettingsForm settings={settings} canEdit={canEdit} />
    </div>
  );
}

export default function SchedulingSettingsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading scheduling settings…
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
    return <SchedulingSettingsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load scheduling settings."}
        </CardContent>
      </Card>
    );
  }
}

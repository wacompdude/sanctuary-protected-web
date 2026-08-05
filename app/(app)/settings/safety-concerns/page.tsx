import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { SafetyConcernRestrictedBanner } from "@/components/safety-concerns/restricted-banner";
import { SafetyConcernSettingsForm } from "@/components/safety-concerns/safety-concern-settings-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/organization/access-guard";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import {
  canManageSafetyConcernSettings,
  getSafetyConcernAccess,
  getSafetyConcernChurchSettings,
} from "@/lib/safety-concerns";

export const metadata: Metadata = {
  title: "Safety Concern Settings",
  robots: { index: false, follow: false },
};

async function SafetyConcernSettingsContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canEdit = canManageSafetyConcernSettings(membership.role);
  const settings = await getSafetyConcernChurchSettings(church.id);
  const access = await getSafetyConcernAccess({
    organizationId: church.id,
    role: membership.role,
    allowSecurityMemberView: settings.allow_security_member_view,
  });

  if (!canEdit && !access.canRead) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Safety Concern settings</CardTitle>
          <CardDescription>{access.upgradeMessage}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Safety Concern settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Access controls, review interval, and activation requirements for{" "}
            {church.name}.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11">
          <Link href="/safety-concerns">Open profiles</Link>
        </Button>
      </div>

      <SafetyConcernRestrictedBanner />

      {!access.entitled ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {access.upgradeMessage} Settings are viewable, but saving requires an
          active plan entitlement.
        </p>
      ) : null}

      {!canEdit ? (
        <p className="text-sm text-muted-foreground">
          You can view these settings. Only administrators and owners can edit
          them.
        </p>
      ) : null}

      <SafetyConcernSettingsForm
        settings={settings}
        canEdit={canEdit && access.entitled}
      />

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
          <CardDescription>
            Review-due and expiration reminders are sent daily to security
            leadership through the existing notification pipeline. Messages do
            not include photos or unnecessary identifying details.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Configure delivery channels under{" "}
          <Link
            href="/notifications/preferences"
            className="underline underline-offset-2"
          >
            notification preferences
          </Link>
          .
        </CardContent>
      </Card>
    </div>
  );
}

async function SettingsLoader() {
  try {
    return <SafetyConcernSettingsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load Safety Concern settings."}
        </CardContent>
      </Card>
    );
  }
}

export default function SafetyConcernSettingsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading Safety Concern settings…
          </CardContent>
        </Card>
      }
    >
      <SettingsLoader />
    </Suspense>
  );
}

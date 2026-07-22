import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  areNotificationTablesAvailable,
  canManageChurchNotificationSettings,
  canSendTestNotification,
  getChurchNotificationSettings,
  getEmailProviderStatus,
} from "@/lib/notifications";
import { getEmailSenderRegistryStatus } from "@/lib/email";
import { isServiceRoleConfigured } from "@/lib/supabase/admin";
import { NotificationSettingsForm } from "@/components/notifications/notification-settings-form";
import { EmailSenderStatus } from "@/components/email/email-sender-status";
import { EmailSenderTestForm } from "@/components/email/email-sender-test-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

async function NotificationSettingsContent() {
  const { supabase, church, membership } =
    await getAuthenticatedUserWithChurch();
  const tablesAvailable = await areNotificationTablesAvailable(supabase);
  const provider = getEmailProviderStatus();
  const canEdit = canManageChurchNotificationSettings(membership.role);
  const canTest = canSendTestNotification(membership.role);
  const serviceRoleConfigured = isServiceRoleConfigured();
  const senderRegistry = getEmailSenderRegistryStatus();

  let settings = null;
  let recipientCount: number | null = null;
  let loadError: string | null = null;

  if (tablesAvailable) {
    try {
      settings = await getChurchNotificationSettings(supabase, church.id);
      const { count, error } = await supabase
        .from("notification_recipients")
        .select("id", { count: "exact", head: true })
        .eq("church_id", church.id);
      if (error) {
        loadError = error.message;
      } else {
        recipientCount = count ?? 0;
      }
    } catch (error) {
      loadError =
        error instanceof Error ? error.message : "Unable to load settings.";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Notification settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Church-wide delivery configuration for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Production status</CardTitle>
          <CardDescription>
            Use this checklist if notifications are missing in production.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Database tables:</span>{" "}
            {tablesAvailable ? "Available" : "Missing — run migration 027"}
          </p>
          <p>
            <span className="font-medium">RLS function grants:</span>{" "}
            {loadError && /permission denied|42501/i.test(loadError)
              ? "Missing — run migration 028"
              : tablesAvailable
                ? "OK (or not yet tested)"
                : "N/A until tables exist"}
          </p>
          <p>
            <span className="font-medium">Service role key:</span>{" "}
            {serviceRoleConfigured ? "Configured" : "Missing on server"}
          </p>
          <p>
            <span className="font-medium">Email provider:</span> {provider.provider}{" "}
            · {provider.configured ? "configured" : "not configured"}
          </p>
          <p>
            <span className="font-medium">Email domain:</span>{" "}
            {provider.emailDomain ?? senderRegistry.domain ?? "—"}
          </p>
          <p>
            <span className="font-medium">Recipient rows for this church:</span>{" "}
            {recipientCount == null ? "—" : recipientCount}
          </p>
          {loadError ? (
            <p className="text-destructive">{loadError}</p>
          ) : null}
          {!tablesAvailable ? (
            <p className="text-muted-foreground">
              Apply{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                supabase/migrations/027_notifications.sql
              </code>{" "}
              then{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                028_notification_function_grants.sql
              </code>{" "}
              in the Supabase SQL editor. For sender history snapshots, also apply{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                037_email_sender_snapshots.sql
              </code>
              .
            </p>
          ) : (
            <p className="text-muted-foreground">
              For delivery sender history columns, apply{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                supabase/migrations/037_email_sender_snapshots.sql
              </code>{" "}
              if not already applied.
            </p>
          )}
          <div className="pt-2">
            <Button asChild variant="outline" className="h-10">
              <Link href="/notifications">Open notifications</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <EmailSenderStatus
        registry={senderRegistry}
        providerName={provider.provider}
        providerConfigured={provider.configured}
      />

      {canEdit || canTest ? (
        <EmailSenderTestForm rows={senderRegistry.rows} canSend={canTest} />
      ) : null}

      {settings ? (
        <NotificationSettingsForm settings={settings} canEdit={canEdit} />
      ) : (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Church notification settings are unavailable until the database
            migration is applied.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function NotificationSettingsWrapper() {
  try {
    return <NotificationSettingsContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    if (error instanceof ChurchAccessError && error.code === "FORBIDDEN_ROLE") {
      return (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-destructive">
              You do not have permission to manage notification settings.
            </p>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load notification settings."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function ChurchNotificationSettingsPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading notification settings...
          </CardContent>
        </Card>
      }
    >
      <NotificationSettingsWrapper />
    </Suspense>
  );
}

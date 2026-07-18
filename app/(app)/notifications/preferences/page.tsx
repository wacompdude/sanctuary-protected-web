import Link from "next/link";
import { Suspense } from "react";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import { NotificationEndpointsPanel } from "@/components/notifications/notification-endpoints-panel";
import { NotificationGroupPreferencesForm } from "@/components/notifications/notification-group-preferences-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  areEndpointTablesAvailable,
  listMyNotificationEndpoints,
} from "@/lib/notifications/endpoints/queries";
import { syncMyNotificationEndpoints } from "@/lib/notifications/endpoints/sync";
import {
  listMyPreferenceRules,
  listPreferableGroupsForUser,
} from "@/lib/notifications/preference-rules/queries";
import { getEmailProviderStatus } from "@/lib/notifications/providers/email-provider";

async function NotificationPreferencesContent() {
  const { supabase, church, user, membership } =
    await getAuthenticatedUserWithChurch();

  const endpointsAvailable = await areEndpointTablesAvailable(supabase);
  if (endpointsAvailable) {
    await syncMyNotificationEndpoints({
      supabase,
      churchId: church.id,
      user,
      membershipId: membership.id,
    });
  }

  const [{ data }, endpoints, rules, groups] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("*")
      .eq("church_id", church.id)
      .eq("user_id", user.id)
      .eq("notification_type", "*")
      .maybeSingle(),
    endpointsAvailable
      ? listMyNotificationEndpoints(supabase, church.id, user.id)
      : Promise.resolve([]),
    listMyPreferenceRules(supabase, church.id, user.id),
    listPreferableGroupsForUser({
      supabase,
      churchId: church.id,
      userId: user.id,
      membershipId: membership.id,
      role: membership.role,
    }),
  ]);

  const emailStatus = getEmailProviderStatus();
  const { data: churchSettings } = await supabase
    .from("church_notification_settings")
    .select(
      "critical_alert_override_enabled, allow_email_override, allow_sms_override, sms_notifications_enabled, push_notifications_enabled",
    )
    .eq("church_id", church.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Notification preferences
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Control how you receive alerts for {church.name}.
          </p>
        </div>
        <Link
          href="/notifications"
          className="text-sm text-muted-foreground underline"
        >
          Back to notifications
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel availability</CardTitle>
          <CardDescription>
            Unsupported channels stay inactive even if you save a preference.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            Email:{" "}
            {emailStatus.configured
              ? `Configured (${emailStatus.provider})`
              : "Provider not configured"}
          </p>
          <p>
            SMS:{" "}
            {churchSettings?.sms_notifications_enabled
              ? "Church enabled (provider pending)"
              : "SMS provider not configured"}
          </p>
          <p>
            Push:{" "}
            {churchSettings?.push_notifications_enabled
              ? "Church enabled (devices pending)"
              : "Push not configured"}
          </p>
          <p>
            Critical override:{" "}
            {churchSettings?.critical_alert_override_enabled !== false
              ? "May bypass quiet hours / routine email opt-out when policy allows"
              : "Disabled by church policy"}
          </p>
        </CardContent>
      </Card>

      <NotificationEndpointsPanel
        endpoints={endpoints}
        tablesAvailable={endpointsAvailable}
      />

      <NotificationPreferencesForm
        initial={
          data
            ? {
                notification_type: String(data.notification_type ?? "*"),
                email_enabled: Boolean(data.email_enabled),
                sms_enabled: Boolean(data.sms_enabled),
                push_enabled: Boolean(data.push_enabled),
                in_app_enabled: Boolean(data.in_app_enabled),
                minimum_severity: String(
                  data.minimum_severity ?? "informational",
                ),
                quiet_hours_enabled: Boolean(data.quiet_hours_enabled),
                quiet_hours_start:
                  (data.quiet_hours_start as string | null) ?? null,
                quiet_hours_end: (data.quiet_hours_end as string | null) ?? null,
                timezone: String(data.timezone ?? "UTC"),
                digest_frequency: String(data.digest_frequency ?? "immediate"),
              }
            : null
        }
      />

      <NotificationGroupPreferencesForm groups={groups} rules={rules} />
    </div>
  );
}

async function NotificationPreferencesWrapper() {
  try {
    return <NotificationPreferencesContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>Unable to load preferences.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Unexpected error."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function NotificationPreferencesPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading notification preferences...
          </CardContent>
        </Card>
      }
    >
      <NotificationPreferencesWrapper />
    </Suspense>
  );
}

import { Suspense } from "react";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function NotificationPreferencesContent() {
  const { supabase, church, user } = await getAuthenticatedUserWithChurch();
  const { data } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("church_id", church.id)
    .eq("user_id", user.id)
    .eq("notification_type", "*")
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Notification preferences
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Control your delivery preferences for {church.name}.
        </p>
      </div>
      <NotificationPreferencesForm
        initial={
          data
            ? {
                notification_type: String(data.notification_type ?? "*"),
                email_enabled: Boolean(data.email_enabled),
                sms_enabled: Boolean(data.sms_enabled),
                push_enabled: Boolean(data.push_enabled),
                in_app_enabled: Boolean(data.in_app_enabled),
                minimum_severity: String(data.minimum_severity ?? "informational"),
                quiet_hours_enabled: Boolean(data.quiet_hours_enabled),
                quiet_hours_start: (data.quiet_hours_start as string | null) ?? null,
                quiet_hours_end: (data.quiet_hours_end as string | null) ?? null,
                timezone: String(data.timezone ?? "UTC"),
                digest_frequency: String(data.digest_frequency ?? "immediate"),
              }
            : null
        }
      />
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

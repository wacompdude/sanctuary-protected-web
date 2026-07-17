import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  canManageChurchNotificationSettings,
  getChurchNotificationSettings,
  getEmailProviderStatus,
} from "@/lib/notifications";
import { NotificationSettingsForm } from "@/components/notifications/notification-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function NotificationSettingsContent() {
  const { supabase, church, membership } = await getAuthenticatedUserWithChurch();
  const settings = await getChurchNotificationSettings(supabase, church.id);
  const provider = getEmailProviderStatus();
  const canEdit = canManageChurchNotificationSettings(membership.role);

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
          <CardTitle>Email provider</CardTitle>
          <CardDescription>
            Provider adapters keep app workflows independent from vendor APIs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Provider:</span> {provider.provider}
          </p>
          <p>
            <span className="font-medium">Configured:</span>{" "}
            {provider.configured ? "Yes" : "No"}
          </p>
          <p className="text-muted-foreground">
            SMS and push channels are placeholders and remain disabled until providers
            and compliance workflows are configured.
          </p>
        </CardContent>
      </Card>

      <NotificationSettingsForm settings={settings} canEdit={canEdit} />
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

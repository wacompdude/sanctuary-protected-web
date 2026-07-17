import { Suspense } from "react";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { canManageNotificationTemplates } from "@/lib/notifications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotificationSeverityBadge } from "@/components/notifications/notification-severity-badge";

async function NotificationTemplatesContent() {
  const { supabase, church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageNotificationTemplates(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to view notification templates.",
      "FORBIDDEN_ROLE",
    );
  }

  const { data, error } = await supabase
    .from("notification_templates")
    .select(
      "id, template_key, name, description, channel, severity, is_system_template, is_active, version, updated_at",
    )
    .or(`church_id.eq.${church.id},church_id.is.null`)
    .order("template_key", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const templates = (data ?? []) as Array<{
    id: string;
    template_key: string;
    name: string;
    description: string | null;
    channel: "email" | "sms" | "push" | "in_app";
    severity: "informational" | "low" | "medium" | "high" | "critical";
    is_system_template: boolean;
    is_active: boolean;
    version: number;
    updated_at: string;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Notification templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          System templates and church overrides for {church.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template catalog</CardTitle>
          <CardDescription>
            Editing and restore actions are wired in Step 5 after full variable
            validation and version controls are finalized.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates found.</p>
          ) : (
            <ul className="space-y-3">
              {templates.map((template) => (
                <li key={template.id} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="font-medium">{template.name}</p>
                    <NotificationSeverityBadge severity={template.severity} />
                    <span className="rounded border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {template.channel}
                    </span>
                    <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {template.is_system_template ? "System" : "Church"}
                    </span>
                    {!template.is_active ? (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Inactive
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {template.template_key} · v{template.version}
                  </p>
                  {template.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {template.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function NotificationTemplatesWrapper() {
  try {
    return <NotificationTemplatesContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Unable to load notification templates."}
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default function NotificationTemplatesPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading templates...
          </CardContent>
        </Card>
      }
    >
      <NotificationTemplatesWrapper />
    </Suspense>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import {
  ApplyScheduleTemplateForm,
} from "@/components/schedule/schedule-template-form";
import { Badge } from "@/components/ui/badge";
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
import {
  labelForScheduleEventType,
  SCHEDULE_MIGRATION_HINT,
} from "@/lib/schedule/constants";
import {
  canManageSchedule,
  canManageScheduleSettings,
} from "@/lib/schedule/permissions";
import { listScheduleCampuses } from "@/lib/schedule/queries";
import { listScheduleTemplates } from "@/lib/schedule/settings-queries";

async function TemplatesContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  const canAdmin = canManageScheduleSettings(membership.role);
  const canApply = canManageSchedule(membership.role);

  if (!canApply && !canAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule templates</CardTitle>
          <CardDescription>
            Security leaders can apply templates. Administrators manage them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/schedule/calendar">Back to calendar</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const [templates, campuses] = await Promise.all([
    listScheduleTemplates(church.id, { includeInactive: canAdmin }),
    listScheduleCampuses(church.id).catch(() => []),
  ]);

  if (!templates.tablesAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule templates</CardTitle>
          <CardDescription>{SCHEDULE_MIGRATION_HINT}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const active = templates.items.filter((t) => t.is_active);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Schedule templates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Blueprints for recurring services and coverage patterns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdmin ? (
            <Button asChild className="h-11">
              <Link href="/schedule/templates/new">
                <Plus className="h-4 w-4" />
                New template
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="h-11">
            <Link href="/settings/scheduling">Scheduling settings</Link>
          </Button>
        </div>
      </div>

      {canApply ? (
        <Card>
          <CardHeader>
            <CardTitle>Create event from template</CardTitle>
            <CardDescription>
              Generates the event and defined shifts in one step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApplyScheduleTemplateForm
              templates={active}
              campuses={campuses}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No templates yet.
              {canAdmin ? " Create one to get started." : ""}
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {templates.items.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-3 py-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{template.name}</p>
                      {!template.is_active ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {labelForScheduleEventType(template.event_type)} ·{" "}
                      {template.default_duration_minutes} min ·{" "}
                      {template.default_shift_definitions.length} shift
                      {template.default_shift_definitions.length === 1
                        ? ""
                        : "s"}
                    </p>
                  </div>
                  {canAdmin ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/schedule/templates/${template.id}/edit`}>
                        Edit
                      </Link>
                    </Button>
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

export default function ScheduleTemplatesPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <CardContent className="py-12 text-sm text-muted-foreground">
            Loading templates…
          </CardContent>
        </Card>
      }
    >
      <TemplatesLoader />
    </Suspense>
  );
}

async function TemplatesLoader() {
  try {
    return <TemplatesContent />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error
            ? error.message
            : "Unable to load schedule templates."}
        </CardContent>
      </Card>
    );
  }
}

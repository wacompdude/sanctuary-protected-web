import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { archiveScheduleTemplateAction } from "@/app/(app)/schedule/template-actions";
import { ScheduleTemplateForm } from "@/components/schedule/schedule-template-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { canManageScheduleSettings } from "@/lib/schedule/permissions";
import { listScheduleCampuses } from "@/lib/schedule/queries";
import { getScheduleTemplate } from "@/lib/schedule/settings-queries";

async function EditTemplateContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageScheduleSettings(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to edit schedule templates.",
    );
  }

  const [template, campuses] = await Promise.all([
    getScheduleTemplate(church.id, id),
    listScheduleCampuses(church.id).catch(() => []),
  ]);

  if (!template) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Template not found.
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link href="/schedule/templates">Back</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const archiveAction = archiveScheduleTemplateAction.bind(null, template.id);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
            <Link href="/schedule/templates">
              <ArrowLeft className="h-4 w-4" />
              Back to templates
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Edit template</h1>
          <p className="mt-1 text-muted-foreground">{template.name}</p>
        </div>
        {template.is_active ? (
          <form action={archiveAction}>
            <Button type="submit" variant="outline" className="h-11">
              Archive template
            </Button>
          </form>
        ) : null}
      </div>
      <ScheduleTemplateForm
        mode="edit"
        campuses={campuses}
        template={template}
      />
    </>
  );
}

export default function EditScheduleTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <EditTemplateLoader params={params} />
      </Suspense>
    </div>
  );
}

async function EditTemplateLoader({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <EditTemplateContent params={params} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to open form."}
        </CardContent>
      </Card>
    );
  }
}

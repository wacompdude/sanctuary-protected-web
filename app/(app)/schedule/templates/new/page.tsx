import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
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

async function NewTemplateContent() {
  const { church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageScheduleSettings(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to create schedule templates.",
    );
  }
  const campuses = await listScheduleCampuses(church.id).catch(() => []);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/templates">
            <ArrowLeft className="h-4 w-4" />
            Back to templates
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New template</h1>
        <p className="mt-1 text-muted-foreground">
          Define a reusable event and shift pattern.
        </p>
      </div>
      <ScheduleTemplateForm mode="create" campuses={campuses} />
    </>
  );
}

export default function NewScheduleTemplatePage() {
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
        <NewTemplateLoader />
      </Suspense>
    </div>
  );
}

async function NewTemplateLoader() {
  try {
    return <NewTemplateContent />;
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

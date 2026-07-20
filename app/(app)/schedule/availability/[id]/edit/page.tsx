import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { UnavailabilityForm } from "@/components/schedule/unavailability-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { getUnavailabilityById } from "@/lib/schedule/availability-queries";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { getChurchScheduleSettings } from "@/lib/schedule/shift-queries";

async function EditAvailabilityContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, church, membership } = await getAuthenticatedUserWithChurch();
  const canManage = canManageSchedule(membership.role);
  const settings = await getChurchScheduleSettings(church.id);
  const membersMayEdit =
    (settings as { members_may_edit_future_unavailability?: boolean } | null)
      ?.members_may_edit_future_unavailability !== false;

  const record = await getUnavailabilityById(
    id,
    church.id,
    user.id,
    canManage,
  );
  if (!record) notFound();

  const isOwner = record.user_id === user.id;
  if (!isOwner && !canManage) {
    throw new ChurchAccessError(
      "You can only edit your own unavailability.",
    );
  }
  if (isOwner && !canManage && !membersMayEdit) {
    throw new ChurchAccessError(
      "Editing unavailability is disabled for members.",
    );
  }
  if (record.status === "cancelled") {
    throw new ChurchAccessError("Cancelled unavailability cannot be edited.");
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href="/schedule/availability">
            <ArrowLeft className="h-4 w-4" />
            Back to availability
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Edit unavailable time
        </h1>
      </div>
      <UnavailabilityForm
        mode="edit"
        record={record}
        timeZone={church.timezone ?? "America/Los_Angeles"}
      />
    </>
  );
}

async function EditAvailabilityWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <EditAvailabilityContent params={params} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to edit."}
        </CardContent>
      </Card>
    );
  }
}

export default function EditUnavailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Suspense
        fallback={
          <Card>
            <CardContent className="py-12 text-sm text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        }
      >
        <EditAvailabilityWrapper params={params} />
      </Suspense>
    </div>
  );
}

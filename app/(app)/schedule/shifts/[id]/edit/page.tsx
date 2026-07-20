import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ScheduleShiftForm } from "@/components/schedule/schedule-shift-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { listScheduleCampuses } from "@/lib/schedule/queries";
import {
  getScheduleShiftById,
  listEventOptionsForShifts,
} from "@/lib/schedule/shift-queries";

async function EditShiftContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { church, membership } = await getAuthenticatedUserWithChurch();
  if (!canManageSchedule(membership.role)) {
    throw new ChurchAccessError(
      "You do not have permission to edit shifts.",
    );
  }

  const [shift, campuses, events] = await Promise.all([
    getScheduleShiftById(id, church.id),
    listScheduleCampuses(church.id).catch(() => []),
    listEventOptionsForShifts(church.id),
  ]);

  if (!shift) notFound();
  if (shift.status === "cancelled") {
    throw new ChurchAccessError("Cancelled shifts cannot be edited.");
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" className="mb-4 -ml-2" asChild>
          <Link href={`/schedule/shifts/${shift.id}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to shift
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Edit shift</h1>
        <p className="mt-1 text-muted-foreground">{shift.title}</p>
      </div>
      <ScheduleShiftForm
        mode="edit"
        shift={shift}
        campuses={campuses}
        events={events}
        timeZone={church.timezone ?? "America/Los_Angeles"}
      />
    </>
  );
}

async function EditShiftWrapper({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    return <EditShiftContent params={params} />;
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to edit shift."}
        </CardContent>
      </Card>
    );
  }
}

export default function EditScheduleShiftPage({
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
        <EditShiftWrapper params={params} />
      </Suspense>
    </div>
  );
}

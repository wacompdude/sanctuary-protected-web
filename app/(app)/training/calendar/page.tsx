import { Suspense } from "react";
import { TrainingCalendarClient } from "@/components/training/training-calendar-client";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { resolveCampusFilter } from "@/lib/campuses/filter";
import { getTrainingAccess } from "@/lib/training/access";
import {
  canManageEvents,
  canViewSensitive,
} from "@/lib/training/permissions";
import { listEvents } from "@/lib/training/queries";

async function TrainingCalendarContent() {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });

  // Wide window so month navigation works without refetching.
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const rangeEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 12,
    0,
    23,
    59,
    59,
  );

  const events = await listEvents(church.id, {
    campusFilter,
    from: rangeStart.toISOString(),
    to: rangeEnd.toISOString(),
    includeSensitive: canViewSensitive(membership.role),
  });

  return (
    <TrainingCalendarClient
      events={events}
      timeZone={church.timezone ?? "America/Los_Angeles"}
      canManage={canManageEvents(membership.role)}
    />
  );
}

export default function TrainingCalendarPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingCalendarContent />
    </Suspense>
  );
}

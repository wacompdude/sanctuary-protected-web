import { Suspense } from "react";
import { TrainingReportsClient } from "@/components/training/training-reports-client";
import { getAuthenticatedUserWithChurch } from "@/lib/church/auth";
import { resolveCampusFilter } from "@/lib/campuses/filter";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { getTrainingAccess } from "@/lib/training/access";
import {
  canRunReports,
  canViewSensitive,
} from "@/lib/training/permissions";
import {
  getSettings,
  listCategories,
  listCompletionRecords,
  listCourses,
  listEvents,
  listRequirements,
} from "@/lib/training/queries";
import { DEFAULT_DUE_SOON_DAYS } from "@/lib/training/constants";
import { redirect } from "next/navigation";

async function TrainingReportsContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;
  if (!canRunReports(membership.role)) redirect("/training");

  const includeSensitive = canViewSensitive(membership.role);
  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });

  const reportType =
    typeof params.type === "string" ? params.type : "member";
  const courseId =
    typeof params.course === "string" ? params.course : undefined;
  const categoryId =
    typeof params.category === "string" ? params.category : undefined;

  const [
    records,
    courses,
    categories,
    requirements,
    events,
    settings,
    team,
  ] = await Promise.all([
    listCompletionRecords(church.id, {
      campusFilter,
      includeSensitive,
      courseId,
      categoryId,
    }),
    listCourses(church.id, { includeSensitive }),
    listCategories(church.id, { includeSensitive }),
    listRequirements(church.id),
    listEvents(church.id, { campusFilter, includeSensitive }),
    getSettings(church.id),
    listChurchTeamMemberships(church.id).catch(() => []),
  ]);

  const teamMembers = team
    .filter((row) => row.status === "active")
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      role: row.role,
    }));

  return (
    <TrainingReportsClient
      reportType={reportType}
      records={records}
      courses={courses}
      categories={categories}
      requirements={requirements}
      events={events}
      teamMembers={teamMembers}
      churchName={church.name}
      dueSoonDays={settings?.due_soon_days ?? DEFAULT_DUE_SOON_DAYS}
    />
  );
}

export default function TrainingReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingReportsContent searchParams={searchParams} />
    </Suspense>
  );
}

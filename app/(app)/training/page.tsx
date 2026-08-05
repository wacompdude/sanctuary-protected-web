import Link from "next/link";
import { Suspense } from "react";
import { DashboardMetrics } from "@/components/training/dashboard-metrics";
import { EventStatusBadge, RenewalStatusBadge } from "@/components/training/status-badges";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthenticatedUserWithChurch } from "@/lib/organization/auth";
import { resolveCampusFilter } from "@/lib/campuses/filter";
import { formatChurchDate } from "@/lib/datetime/format";
import { getTrainingAccess } from "@/lib/training/access";
import {
  canManageEvents,
  canViewSensitive,
} from "@/lib/training/permissions";
import {
  getDashboardMetrics,
  getSettings,
  listCompletionRecords,
  listEvents,
  listCategories,
} from "@/lib/training/queries";

async function TrainingDashboardContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const access = await getTrainingAccess(church.id);
  if (!access.allowed) return null;

  const includeSensitive = canViewSensitive(membership.role);
  const campusFilter = await resolveCampusFilter({
    organizationId: church.id,
    userId: user.id,
    role: membership.role,
  });

  const categoryId =
    typeof params.category === "string" ? params.category : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;

  const [metrics, upcoming, recent, categories, settings] = await Promise.all([
    getDashboardMetrics(church.id, {
      campusFilter,
      includeSensitive,
    }),
    listEvents(church.id, {
      campusFilter,
      categoryId,
      status,
      from: new Date().toISOString(),
      limit: 8,
      includeSensitive,
    }),
    listCompletionRecords(church.id, {
      campusFilter,
      includeSensitive,
      limit: 8,
    }),
    listCategories(church.id, { includeSensitive }),
    getSettings(church.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Overview for {church.name}
          </p>
        </div>
        {canManageEvents(membership.role) ? (
          <Button asChild>
            <Link href="/training/events/new">New event</Link>
          </Button>
        ) : null}
      </div>

      <DashboardMetrics
        metrics={metrics}
        colors={settings.dashboard_metric_colors}
      />

      <form className="flex flex-wrap gap-3 rounded-lg border p-4">
        <select
          name="category"
          defaultValue={categoryId ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="registration_open">Registration open</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Apply filters
        </Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming events</CardTitle>
            <CardDescription>Scheduled training sessions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            ) : (
              upcoming.map((event) => (
                <Link
                  key={event.id}
                  href={`/training/events/${event.id}`}
                  className="block rounded-md border p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{event.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.start_at
                          ? formatChurchDate(event.start_at, { timeZone: church.timezone })
                          : "Date TBD"}
                        {event.campus?.name ? ` · ${event.campus.name}` : ""}
                      </p>
                    </div>
                    <EventStatusBadge status={event.status} />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent completions</CardTitle>
            <CardDescription>Latest training history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completion records yet.</p>
            ) : (
              recent.map((record) => (
                <div key={record.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{record.course_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {record.member_name ?? "Member"} ·{" "}
                        {formatChurchDate(record.completed_at, { timeZone: church.timezone })}
                      </p>
                    </div>
                    {record.renewal_status ? (
                      <RenewalStatusBadge status={record.renewal_status} />
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function TrainingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TrainingDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}

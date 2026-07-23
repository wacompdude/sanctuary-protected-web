import { Suspense } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DashboardStatBox } from "@/components/dashboard/dashboard-stat-box";
import { Button } from "@/components/ui/button";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { rethrowOrRedirectForChurchAccess } from "@/lib/church/access-guard";
import { getCertificationCounts } from "@/lib/certifications/queries";
import { listIncidentsForChurch } from "@/lib/incidents/queries";
import { getUnacknowledgedEventCount } from "@/lib/events/queries";
import { formatDateTime } from "@/lib/incidents/format";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { getCurrentChurchThreatLevel } from "@/lib/church/threat-level-queries";
import {
  canManageThreatLevels,
  formatThreatWeek,
  labelForThreatLevel,
  rankLabelForThreatLevel,
  threatLevelBadgeClassName,
  threatLevelBadgeStyle,
} from "@/lib/church/threat-levels";
import { canManageSchedule } from "@/lib/schedule/permissions";
import { getScheduleDashboardSummary } from "@/lib/schedule/dashboard-queries";
import {
  campusFilterLabel,
  campusFilterOrClause,
  resolveCampusFilter,
} from "@/lib/campuses/filter";
import {
  canManageDashboardCustomization,
  resolveDashboardBoxSettings,
} from "@/lib/dashboard";
import {
  dashboardBoxNeedsCertifications,
  dashboardBoxNeedsEvents,
  dashboardBoxNeedsIncidents,
  getDashboardBoxValue,
  type DashboardBoxDataContext,
} from "@/lib/dashboard/box-values";
import type { DashboardBoxKey } from "@/lib/dashboard/types";

async function DashboardContent() {
  const { church, membership, user } = await getAuthenticatedUserWithChurch();
  const campusFilter = await resolveCampusFilter({
    churchId: church.id,
    userId: user.id,
    role: membership.role,
  });
  const campusOr = campusFilterOrClause(campusFilter);
  const filterLabel = campusFilterLabel(campusFilter);
  const canSeeManagerSchedule = canManageSchedule(membership.role);
  const canCustomize = canManageDashboardCustomization(membership.role);

  const resolvedBoxes = await resolveDashboardBoxSettings({
    churchId: church.id,
    userRole: membership.role,
    canManageSchedule: canSeeManagerSchedule,
    includeHidden: false,
  });

  const visibleKeys = resolvedBoxes.map((box) => box.key);
  const needsIncidents = dashboardBoxNeedsIncidents(visibleKeys);
  const needsEvents = dashboardBoxNeedsEvents(visibleKeys);
  const needsCertifications = dashboardBoxNeedsCertifications(visibleKeys);

  const [
    certCounts,
    incidents,
    unackedEvents,
    currentThreatLevel,
    schedule,
  ] = await Promise.all([
    needsCertifications
      ? getCertificationCounts(church.id)
      : Promise.resolve({ expiring_soon: 0, expired: 0 }),
    needsIncidents
      ? listIncidentsForChurch(church.id, "occurred_at_desc", {
          campusFilterOr: campusOr,
        }).catch(() => [])
      : Promise.resolve([]),
    needsEvents
      ? getUnacknowledgedEventCount(church.id, {
          campusFilterOr: campusOr,
        }).catch(() => 0)
      : Promise.resolve(0),
    getCurrentChurchThreatLevel(church.id).catch(() => null),
    // Always load for “My next shift”; also powers visible schedule boxes.
    getScheduleDashboardSummary(
      church.id,
      user.id,
      church.timezone ?? "America/Los_Angeles",
      { campusFilterOr: campusOr },
    ).catch(() => null),
  ]);

  const openIncidents = incidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "investigating",
  ).length;

  const boxData: DashboardBoxDataContext = {
    openIncidents,
    totalIncidents: incidents.length,
    unacknowledgedEvents: unackedEvents,
    certificationsExpiring: certCounts.expiring_soon,
    certificationsExpired: certCounts.expired,
    schedule,
  };

  const scheduleTablesAvailable = Boolean(schedule?.tablesAvailable);
  const displayBoxes = resolvedBoxes.filter(
    (box) => box.category !== "schedule" || scheduleTablesAvailable,
  );

  return (
    <>
      <Card>
        <CardHeader className="space-y-0 pb-3">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <CardDescription>Weekly Threat Level</CardDescription>
              {currentThreatLevel ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={threatLevelBadgeClassName(
                      currentThreatLevel.threat_level,
                    )}
                    style={threatLevelBadgeStyle(currentThreatLevel.threat_level)}
                  >
                    {labelForThreatLevel(currentThreatLevel.threat_level)}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {rankLabelForThreatLevel(currentThreatLevel.threat_level)}
                  </p>
                </div>
              ) : (
                <CardTitle className="text-2xl">No threat level recorded</CardTitle>
              )}
            </div>
            <div className="hidden shrink-0 flex-wrap gap-2 md:flex">
              <Button asChild variant="outline" className="h-11">
                <Link href="/dashboard/threat-level/history">
                  Threat level history
                </Link>
              </Button>
              {canManageThreatLevels(membership.role) ? (
                <Button asChild className="h-11">
                  <Link href="/dashboard/threat-level">
                    {currentThreatLevel
                      ? "Change threat level"
                      : "Set threat level"}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentThreatLevel ? (
            <>
              <div className="min-w-0 rounded-md border border-border bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Why this level
                </p>
                {currentThreatLevel.notes ? (
                  <p className="mt-2 break-words whitespace-pre-wrap text-base leading-relaxed text-foreground">
                    {currentThreatLevel.notes}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No notes recorded for this weekly threat level.
                  </p>
                )}
              </div>
              <p className="break-words text-sm text-muted-foreground">
                Week of{" "}
                {formatThreatWeek(
                  currentThreatLevel.week_start,
                  church.timezone,
                )}
                . Last changed by {currentThreatLevel.changed_by_name} on{" "}
                {formatDateTime(
                  currentThreatLevel.created_at,
                  null,
                  church.timezone,
                )}
                .
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set the weekly threat level so the team sees the current operational
              posture at a glance.
            </p>
          )}
          <div className="flex flex-col gap-2 md:hidden">
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href="/dashboard/threat-level/history">
                Threat level history
              </Link>
            </Button>
            {canManageThreatLevels(membership.role) ? (
              <Button asChild className="h-11 w-full">
                <Link href="/dashboard/threat-level">
                  {currentThreatLevel
                    ? "Change threat level"
                    : "Set threat level"}
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            Overview for {church.name} · {filterLabel}
            {campusFilter.mode === "all" &&
            !campusFilter.implicitAllAccess &&
            campusFilter.accessibleCampusIds.length > 0
              ? ` (${campusFilter.accessibleCampusIds.length} authorized)`
              : ""}
            .
          </p>
        </div>
        {canCustomize ? (
          <Button asChild variant="outline" className="h-11">
            <Link href="/settings/dashboard">Customize boxes</Link>
          </Button>
        ) : null}
      </div>

      {displayBoxes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {displayBoxes.map((box) => {
            const { value, description } = getDashboardBoxValue(
              box.key as DashboardBoxKey,
              boxData,
            );
            return (
              <DashboardStatBox
                key={box.key}
                box={box}
                value={value}
                description={description}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No dashboard boxes are visible
            {canCustomize ? (
              <>
                .{" "}
                <Link
                  href="/settings/dashboard"
                  className="underline underline-offset-2"
                >
                  Customize boxes
                </Link>{" "}
                to show summary tiles again.
              </>
            ) : (
              "."
            )}
          </CardContent>
        </Card>
      )}

      {scheduleTablesAvailable ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Scheduling</h2>
              <p className="text-sm text-muted-foreground">
                Your upcoming coverage
                {campusFilter.mode === "campus"
                  ? ` for ${filterLabel}`
                  : " across authorized campuses"}
                .
              </p>
            </div>
            <Button asChild variant="outline" className="h-10">
              <Link href="/schedule/calendar">Open calendar</Link>
            </Button>
          </div>

          {schedule?.myNextShift ? (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>My next shift</CardDescription>
                <CardTitle className="text-lg">
                  {schedule.myNextShift.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {formatChurchDateTime(schedule.myNextShift.start_at, {
                    timeZone: church.timezone ?? undefined,
                  })}
                  {" – "}
                  {formatChurchDateTime(schedule.myNextShift.end_at, {
                    timeZone: church.timezone ?? undefined,
                  })}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/schedule/shifts/${schedule.myNextShift.id}`}>
                    View shift
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                No upcoming assignments on your schedule.{" "}
                <Link
                  href="/schedule/my-schedule"
                  className="underline underline-offset-2"
                >
                  Open My Schedule
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}

function DashboardFallback() {
  return (
    <Card>
      <CardContent className="py-12 text-sm text-muted-foreground">
        Loading dashboard…
      </CardContent>
    </Card>
  );
}

async function DashboardWrapper() {
  try {
    return await DashboardContent();
  } catch (error) {
    rethrowOrRedirectForChurchAccess(error);

    const message =
      error instanceof ChurchAccessError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load dashboard.";

    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-destructive">{message}</p>
        </CardContent>
      </Card>
    );
  }
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <Suspense fallback={<DashboardFallback />}>
        <DashboardWrapper />
      </Suspense>
    </div>
  );
}
